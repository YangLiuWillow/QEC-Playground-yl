//! build model graph from simulator and measurement results
//!

use crate::model_graph::*;
use crate::noise_model::*;
use crate::simulator::*;
use crate::types::*;
use crate::util_macros::*;
use crate::visualize::QecpVisualizer;
use either::Either;
use float_cmp;
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

/// edges connecting two nontrivial measurements generated by a single error
#[derive(Debug, Clone, Serialize)]
pub struct TailoredModelGraph {
    /// `(positive_node, negative_node, neutral_node)`, where neutral node only contains
    pub nodes: Vec<Vec<Vec<Option<Box<TripleTailoredModelGraphNode>>>>>,
    /// virtual nodes in the primary decoding part
    pub virtual_nodes: Vec<Position>,
    /// virtual nodes in the residual decoding part
    pub corner_virtual_nodes: Vec<(Position, Position)>,
    /// unfixed stabilizers
    pub unfixed_stabilizers: HashSet<Position>,
}

impl QecpVisualizer for TailoredModelGraph {
    fn component_info(&self, abbrev: bool) -> (String, serde_json::Value) {
        let name = "tailored_model_graph";
        let info = json!({
            "nodes": (0..self.nodes.len()).map(|t| {
                (0..self.nodes[t].len()).map(|i| {
                    (0..self.nodes[t][i].len()).map(|j| {
                        let position = &pos!(t, i, j);
                        if self.is_node_exist(position) {
                            let triple_node = self.get_node_unwrap(position);
                            let mut triple_json = vec![];
                            for i in 0..3 {
                                let node = &triple_node[i];
                                let mut edges = serde_json::Map::with_capacity(node.edges.len());
                                for (peer_position, edge) in node.edges.iter() {
                                    edges.insert(peer_position.to_string(), edge.component_edge_info(abbrev));
                                }
                                let mut all_edges = serde_json::Map::with_capacity(node.all_edges.len());
                                for (peer_position, all_edge) in node.all_edges.iter() {
                                    let components: Vec<_> = all_edge.iter().map(|edge| edge.component_edge_info(abbrev)).collect();
                                    all_edges.insert(peer_position.to_string(), json!(components));
                                }
                                triple_json.push(json!({
                                    if abbrev { "p" } else { "position" }: position,  // for readability
                                    "all_edges": all_edges,
                                    "edges": edges,
                                }))
                            }
                            Some(json!(triple_json))
                        } else {
                            None
                        }
                    }).collect::<Vec<Option<serde_json::Value>>>()
                }).collect::<Vec<Vec<Option<serde_json::Value>>>>()
            }).collect::<Vec<Vec<Vec<Option<serde_json::Value>>>>>(),
            "virtual_nodes": self.virtual_nodes,
            "corner_virtual_nodes": self.corner_virtual_nodes,
            "unfixed_stabilizers": self.unfixed_stabilizers,
        });
        (name.to_string(), info)
    }
}

/// only defined for measurement nodes (including virtual measurement nodes)
#[derive(Debug, Clone, Serialize)]
pub struct TailoredModelGraphNode {
    /// used when building the graph, record all possible edges that connect the two measurement syndromes.
    /// (this might be dropped to save memory usage after election)
    pub all_edges: BTreeMap<Position, Vec<TailoredModelGraphEdge>>,
    /// the elected edges, to make sure each pair of nodes only have one edge
    pub edges: BTreeMap<Position, TailoredModelGraphEdge>,
}

pub type TripleTailoredModelGraphNode = [TailoredModelGraphNode; 3];

#[derive(Debug, Clone, Serialize)]
pub struct TailoredModelGraphEdge {
    /// the probability of this edge to happen
    pub probability: f64,
    /// the weight of this edge computed by the (combined) probability, e.g. ln((1-p)/p)
    pub weight: f64,
    /// the error that causes this edge
    pub error_pattern: Arc<SparseErrorPattern>,
    /// the correction pattern that can recover this error
    pub correction: Arc<SparseCorrection>,
}

impl TailoredModelGraphEdge {
    fn component_edge_info(&self, abbrev: bool) -> serde_json::Value {
        json!({
            if abbrev { "p" } else { "probability" }: self.probability,
            if abbrev { "w" } else { "weight" }: self.weight,
            if abbrev { "e" } else { "error_pattern" }: self.error_pattern,
            if abbrev { "c" } else { "correction" }: self.correction,
        })
    }
}

impl TailoredModelGraph {
    /// initialize the structure corresponding to a `Simulator`
    pub fn new(simulator: &Simulator) -> Self {
        assert!(
            simulator.volume() > 0,
            "cannot build graph out of zero-sized simulator"
        );
        Self {
            nodes: (0..simulator.height)
                .map(|t| {
                    (0..simulator.vertical)
                        .map(|i| {
                            (0..simulator.horizontal)
                                .map(|j| {
                                    let position = &pos!(t, i, j);
                                    // tailored model graph contains both real node and virtual node at measurement round
                                    if t != 0
                                        && t % simulator.measurement_cycles == 0
                                        && simulator.is_node_exist(position)
                                    {
                                        let node = simulator.get_node_unwrap(position);
                                        if node.gate_type.is_measurement() {
                                            // only define model graph node for measurements
                                            return Some(Box::new([
                                                TailoredModelGraphNode {
                                                    all_edges: BTreeMap::new(),
                                                    edges: BTreeMap::new(),
                                                },
                                                TailoredModelGraphNode {
                                                    all_edges: BTreeMap::new(),
                                                    edges: BTreeMap::new(),
                                                },
                                                TailoredModelGraphNode {
                                                    all_edges: BTreeMap::new(),
                                                    edges: BTreeMap::new(),
                                                },
                                            ]));
                                        }
                                    }
                                    None
                                })
                                .collect()
                        })
                        .collect()
                })
                .collect(),
            virtual_nodes: vec![],
            corner_virtual_nodes: vec![],
            unfixed_stabilizers: HashSet::new(),
        }
    }

    /// any valid position of the simulator is a valid position in model graph, but only some of these positions corresponds a valid node in model graph
    pub fn get_node(
        &'_ self,
        position: &Position,
    ) -> &'_ Option<Box<TripleTailoredModelGraphNode>> {
        &self.nodes[position.t][position.i][position.j]
    }

    /// check if a position contains model graph node
    pub fn is_node_exist(&self, position: &Position) -> bool {
        self.get_node(position).is_some()
    }

    /// get reference `self.nodes[t][i][j]` and then unwrap
    pub fn get_node_unwrap(&'_ self, position: &Position) -> &'_ TripleTailoredModelGraphNode {
        self.get_node(position).as_ref().unwrap()
    }

    /// get mutable reference `self.nodes[t][i][j]` and unwrap
    pub fn get_node_mut_unwrap(
        &'_ mut self,
        position: &Position,
    ) -> &'_ mut TripleTailoredModelGraphNode {
        self.nodes[position.t][position.i][position.j]
            .as_mut()
            .unwrap()
    }

    /// build model graph given the simulator
    pub fn build(
        &mut self,
        simulator: &mut Simulator,
        noise_model: &NoiseModel,
        weight_function: &WeightFunction,
        use_combined_probability: bool,
    ) {
        match weight_function {
            WeightFunction::Autotune => self.build_with_weight_function(
                simulator,
                noise_model,
                weight_function::autotune,
                use_combined_probability,
            ),
            WeightFunction::AutotuneImproved => self.build_with_weight_function(
                simulator,
                noise_model,
                weight_function::autotune_improved,
                use_combined_probability,
            ),
            WeightFunction::Unweighted => self.build_with_weight_function(
                simulator,
                noise_model,
                weight_function::unweighted,
                use_combined_probability,
            ),
        }
    }

    pub fn is_state_clean(&self, simulator: &Simulator) -> bool {
        let mut state_clean = true;
        simulator_iter!(simulator, position, node, {
            // here I omitted the condition `t % measurement_cycles == 0` for a stricter check
            if position.t != 0 && node.gate_type.is_measurement() {
                let [positive_node, negative_node, neutral_node] = self.get_node_unwrap(position);
                if positive_node.all_edges.len() > 0 || positive_node.edges.len() > 0 {
                    state_clean = false;
                }
                if negative_node.all_edges.len() > 0 || negative_node.edges.len() > 0 {
                    state_clean = false;
                }
                if neutral_node.all_edges.len() > 0 || neutral_node.edges.len() > 0 {
                    state_clean = false;
                }
            }
        });
        state_clean
    }

    /// optimization technique from Shruti: if an error causes N error but out of which M
    /// stabilizers are unfixed (connected by 50% edges), then we should add this edge to both
    /// the positive and negative graph because this edge is essentially easy to decode.
    /// Especially in the tailored surface code with initialization, 1/4 to 1/2 stabilizers are
    /// unfixed, meaning there is a lot room for such optimization.
    /// Indeed, with this optimization, this tailored SC decoder will function just like a regular
    /// decoder in the depolarizing noise, which satisfy our expectation.
    pub fn compute_unfixed_stabilizers(
        &mut self,
        simulator: &mut Simulator,
        noise_model: &NoiseModel,
    ) {
        let all_possible_errors = ErrorType::all_possible_errors();
        simulator.clear_all_errors();
        self.unfixed_stabilizers.clear();
        simulator_iter!(simulator, position, {
            let noise_model_node = noise_model.get_node_unwrap(position);
            for &error_type in all_possible_errors.iter() {
                let p = noise_model_node.pauli_error_rates.error_rate(&error_type);
                if p == 0.5 {
                    let mut sparse_errors = SparseErrorPattern::new();
                    sparse_errors.add(position.clone(), error_type);
                    let sparse_errors = Arc::new(sparse_errors); // make it immutable and shared
                    let (_, sparse_measurement_real, sparse_measurement_virtual) =
                        simulator.fast_measurement_given_few_errors(&sparse_errors);
                    let sparse_measurement_real = sparse_measurement_real.to_vec();
                    let sparse_measurement_virtual = sparse_measurement_virtual.to_vec();
                    if sparse_measurement_real.len() == 1 && sparse_measurement_virtual.len() == 1 {
                        self.unfixed_stabilizers
                            .insert(sparse_measurement_real[0].clone());
                    }
                }
            }
        });
    }

    /// build model graph given the simulator with customized weight function
    pub fn build_with_weight_function<F>(
        &mut self,
        simulator: &mut Simulator,
        noise_model: &NoiseModel,
        weight_of: F,
        use_combined_probability: bool,
    ) where
        F: Fn(f64) -> f64 + Copy,
    {
        debug_assert!(
            self.is_state_clean(simulator),
            "[warning] state must be clean before calling `build`, please make sure you don't call this function twice"
        );
        self.compute_unfixed_stabilizers(simulator, noise_model);
        // calculate all possible errors to be iterated
        let mut all_possible_errors: Vec<Either<ErrorType, CorrelatedPauliErrorType>> = Vec::new();
        for error_type in ErrorType::all_possible_errors().drain(..) {
            all_possible_errors.push(Either::Left(error_type));
        }
        for correlated_error_type in CorrelatedPauliErrorType::all_possible_errors().drain(..) {
            all_possible_errors.push(Either::Right(correlated_error_type));
        }
        // clear the states in simulator including pauli, erasure errors and propagated errors
        simulator.clear_all_errors();
        // iterate over all possible errors at all possible positions
        simulator_iter!(simulator, position, {
            let noise_model_node = noise_model.get_node_unwrap(position);
            // whether it's possible to have erasure error at this node
            let possible_erasure_error = noise_model_node.erasure_error_rate > 0.
                || noise_model_node.correlated_erasure_error_rates.is_some()
                || {
                    let node = simulator.get_node_unwrap(position);
                    if let Some(gate_peer) = node.gate_peer.as_ref() {
                        let peer_noise_model_node = noise_model.get_node_unwrap(gate_peer);
                        if let Some(correlated_erasure_error_rates) =
                            &peer_noise_model_node.correlated_erasure_error_rates
                        {
                            correlated_erasure_error_rates.error_probability() > 0.
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                };
            for error in all_possible_errors.iter() {
                let p = match error {
                    Either::Left(error_type) => {
                        noise_model_node.pauli_error_rates.error_rate(error_type)
                    }
                    Either::Right(error_type) => {
                        match &noise_model_node.correlated_pauli_error_rates {
                            Some(correlated_pauli_error_rates) => {
                                correlated_pauli_error_rates.error_rate(error_type)
                            }
                            None => 0.,
                        }
                    }
                }; // probability of this error to occur
                let is_erasure = possible_erasure_error && error.is_left();
                if p > 0. || is_erasure {
                    // use possible errors to build `all_edges`
                    // simulate the error and measure it
                    let mut sparse_errors = SparseErrorPattern::new();
                    match error {
                        Either::Left(error_type) => {
                            sparse_errors.add(position.clone(), error_type.clone());
                        }
                        Either::Right(error_type) => {
                            sparse_errors.add(position.clone(), error_type.my_error());
                            let node = simulator.get_node_unwrap(position);
                            let gate_peer = node
                                .gate_peer
                                .as_ref()
                                .expect("correlated error must corresponds to a two-qubit gate");
                            sparse_errors.add((**gate_peer).clone(), error_type.peer_error());
                        }
                    }
                    let sparse_errors = Arc::new(sparse_errors); // make it immutable and shared
                    let (sparse_correction, sparse_measurement_real, sparse_measurement_virtual) =
                        simulator.fast_measurement_given_few_errors(&sparse_errors);
                    let sparse_correction = Arc::new(sparse_correction); // make it immutable and shared
                    let sparse_measurement_real = sparse_measurement_real.to_vec();
                    let sparse_measurement_virtual = sparse_measurement_virtual.to_vec();
                    if sparse_measurement_real.len() == 0 {
                        // no way to detect it, ignore
                        continue;
                    }
                    // println!("{:?} at {} will cause measurement errors: real {:?} and virtual {:?}", error, position, sparse_measurement_real, sparse_measurement_virtual);
                    let sparse_measurement: Vec<&Position> = sparse_measurement_real
                        .iter()
                        .chain(sparse_measurement_virtual.iter())
                        .collect();
                    // println!("sparse_measurement.len(): {}", sparse_measurement.len());
                    // assert!(sparse_measurement.len() == 2 || sparse_measurement.len() == 4, "I don't know how to handle other cases, so strictly check it");
                    // Yue 2022.7.11: Bell init with circuit-level noise may generate 6 or 8 non-trivial measurements, so I removed this assertion
                    if sparse_measurement.len() == 2 {
                        let position1 = &sparse_measurement[0];
                        let position2 = &sparse_measurement[1];
                        let node1 = simulator.get_node_unwrap(position1);
                        let node2 = simulator.get_node_unwrap(position2);
                        debug_assert!({
                            // when considering virtual nodes, qubit type should be the same (correct me if it's wrong)
                            node1.qubit_type == node2.qubit_type
                        });
                        if p > 0. || is_erasure {
                            self.add_edge_between(
                                position1,
                                position2,
                                p,
                                weight_of(p),
                                sparse_errors.clone(),
                                sparse_correction.clone(),
                            );
                        }
                    }
                    if sparse_measurement.len() == 4 {
                        // tailored edges
                        // tailored surface code decoding method can handle special cases arXiv:1907.02554v2
                        // first find the individual median i and j, then (i, j) must be the center data qubit
                        // Yue 2022.4.11: this method doesn't apply to periodic code: we need more logic for periodic code
                        // I put it into the logic of [`code_builder`], to have a generic function of `get_left`, `get_up`, `get_right`, `get_down`
                        let mut up = None;
                        let mut down = None;
                        let mut left = None;
                        let mut right = None;
                        for x in 0..4 {
                            let left_up = simulator.code_type.get_left_up(
                                sparse_measurement[x].i,
                                sparse_measurement[x].j,
                                &simulator.code_size,
                            );
                            let left_down = simulator.code_type.get_left_down(
                                sparse_measurement[x].i,
                                sparse_measurement[x].j,
                                &simulator.code_size,
                            );
                            let right_up = simulator.code_type.get_right_up(
                                sparse_measurement[x].i,
                                sparse_measurement[x].j,
                                &simulator.code_size,
                            );
                            let right_down = simulator.code_type.get_right_down(
                                sparse_measurement[x].i,
                                sparse_measurement[x].j,
                                &simulator.code_size,
                            );
                            for y in 0..4 {
                                for z in 0..4 {
                                    if (sparse_measurement[y].i, sparse_measurement[y].j)
                                        == left_down
                                        && (sparse_measurement[z].i, sparse_measurement[z].j)
                                            == right_down
                                    {
                                        up = Some(sparse_measurement[x].clone());
                                    }
                                    if (sparse_measurement[y].i, sparse_measurement[y].j) == left_up
                                        && (sparse_measurement[z].i, sparse_measurement[z].j)
                                            == right_up
                                    {
                                        down = Some(sparse_measurement[x].clone());
                                    }
                                    if (sparse_measurement[y].i, sparse_measurement[y].j) == left_up
                                        && (sparse_measurement[z].i, sparse_measurement[z].j)
                                            == left_down
                                    {
                                        right = Some(sparse_measurement[x].clone());
                                    }
                                    if (sparse_measurement[y].i, sparse_measurement[y].j)
                                        == right_up
                                        && (sparse_measurement[z].i, sparse_measurement[z].j)
                                            == right_down
                                    {
                                        left = Some(sparse_measurement[x].clone());
                                    }
                                }
                            }
                        }
                        let mut unknown_case_warning = false;
                        match (up, down, left, right) {
                            (Some(up), Some(down), Some(left), Some(right)) => {
                                // add them to `tailored_positive_edges` and `tailored_negative_edges`
                                {
                                    // positive: up + right, left + down
                                    for (a, b) in [(&up, &right), (&left, &down)] {
                                        self.add_positive_edge_between(
                                            a,
                                            b,
                                            p,
                                            weight_of(p),
                                            sparse_errors.clone(),
                                            sparse_correction.clone(),
                                        );
                                    }
                                }
                                {
                                    // negative: left + up, down + right
                                    for (a, b) in [(&left, &up), (&down, &right)] {
                                        self.add_negative_edge_between(
                                            a,
                                            b,
                                            p,
                                            weight_of(p),
                                            sparse_errors.clone(),
                                            sparse_correction.clone(),
                                        );
                                    }
                                }
                            }
                            _ => {
                                unknown_case_warning = true;
                            }
                        }
                        if unknown_case_warning {
                            // this cases seem to be normal for circuit-level noise model of tailored surface code: Pauli Y would generate some strange cases, but those are low-biased errors
                            // println!("[warning ]error at {} {}: cannot recognize the pattern of this 4 non-trivial measurements, skipped", position, error);
                            // for position in sparse_measurement.iter() {
                            //     print!("{}, ", position);
                            // }
                            // println!("");
                        }
                    }
                }
            }
        });
        self.elect_edges(simulator, use_combined_probability, weight_of); // by default use combined probability

        // build virtual nodes for decoding use
        let mut virtual_nodes = Vec::new();
        simulator_iter!(simulator, position, delta_t => simulator.measurement_cycles, if self.is_node_exist(position) {
            let node = simulator.get_node_unwrap(position);
            if node.is_virtual {
                virtual_nodes.push(position.clone());
            }
        });
        self.virtual_nodes = virtual_nodes;

        // build corner virtual nodes for residual decoding, see https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.124.130501
        // corner virtual nodes, in my understanding, is those having connection with only one real node
        let mut corner_virtual_nodes = Vec::<(Position, Position)>::new();
        simulator_iter!(simulator, position, delta_t => simulator.measurement_cycles, if self.is_node_exist(position) {
            let node = simulator.get_node_unwrap(position);
            if node.is_virtual {
                if let Some(miscellaneous) = &node.miscellaneous {
                    if miscellaneous.get("is_corner") == Some(&json!(true)) {
                        let peer_corner = miscellaneous.get("peer_corner").expect("corner must appear in pair, either in standard or rotated tailored surface code");
                        let peer_position = serde_json::from_value(peer_corner.clone()).unwrap();
                        corner_virtual_nodes.push((position.clone(), peer_position));
                    }
                }
            }
        });
        self.corner_virtual_nodes = corner_virtual_nodes;
    }

    /// add asymmetric edge from `source` to `target` in positive direction;
    /// in order to create symmetric edge, call this function twice with reversed input
    pub fn add_one_edge(
        &mut self,
        source: &Position,
        target: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
        idx: usize,
    ) {
        let node = &mut self.get_node_mut_unwrap(source)[idx];
        if !node.all_edges.contains_key(target) {
            node.all_edges.insert(target.clone(), Vec::new());
        }
        node.all_edges
            .get_mut(target)
            .unwrap()
            .push(TailoredModelGraphEdge {
                probability: probability,
                weight: weight,
                error_pattern: error_pattern,
                correction: correction,
            })
    }

    /// add asymmetric edge from `source` to `target` in positive direction; in order to create symmetric edge, call this function twice with reversed input
    pub fn add_positive_edge(
        &mut self,
        source: &Position,
        target: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
    ) {
        self.add_one_edge(
            source,
            target,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
            0,
        );
    }

    /// add symmetric edge between `source` and `target` in positive direction
    pub fn add_positive_edge_between(
        &mut self,
        position1: &Position,
        position2: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
    ) {
        self.add_positive_edge(
            position1,
            position2,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
        self.add_positive_edge(
            position2,
            position1,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
    }

    /// add asymmetric edge from `source` to `target` in negative direction; in order to create symmetric edge, call this function twice with reversed input
    pub fn add_negative_edge(
        &mut self,
        source: &Position,
        target: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
    ) {
        self.add_one_edge(
            source,
            target,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
            1,
        );
    }

    /// add symmetric edge between `source` and `target` in negative direction
    pub fn add_negative_edge_between(
        &mut self,
        position1: &Position,
        position2: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
    ) {
        self.add_negative_edge(
            position1,
            position2,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
        self.add_negative_edge(
            position2,
            position1,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
    }

    /// add asymmetric edge from `source` to `target` in negative direction; in order to create symmetric edge, call this function twice with reversed input
    pub fn add_neutral_edge(
        &mut self,
        source: &Position,
        target: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
    ) {
        self.add_one_edge(
            source,
            target,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
            2,
        );
    }

    /// add symmetric edge between `source` and `target` in negative direction
    pub fn add_neutral_edge_between(
        &mut self,
        position1: &Position,
        position2: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
    ) {
        self.add_neutral_edge(
            position1,
            position2,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
        self.add_neutral_edge(
            position2,
            position1,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
    }

    /// add asymmetric edge from `source` to `target`; in order to create symmetric edge, call this function twice with reversed input
    pub fn add_edge_between(
        &mut self,
        position1: &Position,
        position2: &Position,
        probability: f64,
        weight: f64,
        error_pattern: Arc<SparseErrorPattern>,
        correction: Arc<SparseCorrection>,
    ) {
        self.add_positive_edge_between(
            position1,
            position2,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
        self.add_negative_edge_between(
            position2,
            position1,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
        self.add_neutral_edge_between(
            position2,
            position1,
            probability,
            weight,
            error_pattern.clone(),
            correction.clone(),
        );
    }

    /// if there are multiple edges connecting two stabilizer measurements, elect the best one
    pub fn elect_edges<F>(
        &mut self,
        simulator: &Simulator,
        use_combined_probability: bool,
        weight_of: F,
    ) where
        F: Fn(f64) -> f64 + Copy,
    {
        simulator_iter!(simulator, position, delta_t => simulator.measurement_cycles, if self.is_node_exist(position) {
            let [positive_node, negative_node, neutral_node] = self.get_node_mut_unwrap(position);
            // elect edges
            for node in [positive_node, negative_node, neutral_node] {
                for (target, edges) in node.all_edges.iter() {
                    let mut elected_idx = 0;
                    let mut elected_probability = edges[0].probability;
                    for i in 1..edges.len() {
                        let edge = &edges[i];
                        // update `elected_probability`
                        if use_combined_probability {
                            elected_probability = elected_probability * (1. - edge.probability) + edge.probability * (1. - elected_probability);  // XOR
                        } else {
                            elected_probability = elected_probability.max(edge.probability);
                        }
                        // update `elected_idx`
                        let best_edge = &edges[elected_idx];
                        if edge.probability > best_edge.probability {
                            elected_idx = i;  // set as best, use its
                        }
                    }
                    let elected = TailoredModelGraphEdge {
                        probability: elected_probability,
                        weight: weight_of(elected_probability),
                        error_pattern: edges[elected_idx].error_pattern.clone(),
                        correction: edges[elected_idx].correction.clone(),
                    };
                    // update elected edge
                    // println!("{} to {} elected probability: {}", position, target, elected.probability);
                    node.edges.insert(target.clone(), elected);
                }
            }
        });
        // sanity check, two nodes on one edge have the same edge information, should be a cheap sanity check
        debug_assert!({
            let mut sanity_check_passed = true;
            for t in (simulator.measurement_cycles..simulator.height)
                .step_by(simulator.measurement_cycles)
            {
                simulator_iter!(simulator, position, node, t => t, if node.gate_type.is_measurement() {
                    for idx in 0..3 {
                        let node = &self.get_node_unwrap(position)[idx];  // idx = 0: positive, 1: negative
                        for (target, edge) in node.edges.iter() {
                            let target_node = &self.get_node_unwrap(target)[idx];  // idx = 0: positive, 1: negative
                            let reverse_edge = target_node.edges.get(position).expect("edge should be symmetric");
                            if !float_cmp::approx_eq!(f64, edge.probability, reverse_edge.probability, ulps = 5) {
                                println!("[warning] the edge between {} and {} has unequal probability {} and {}"
                                    , position, target, edge.probability, reverse_edge.probability);
                                sanity_check_passed = false;
                            }
                        }
                    }
                });
            }
            sanity_check_passed
        });
    }

    /// create json object for debugging and viewing
    pub fn to_json(&self, simulator: &Simulator) -> serde_json::Value {
        json!({
            "code_type": simulator.code_type,
            "height": simulator.height,
            "vertical": simulator.vertical,
            "horizontal": simulator.horizontal,
            "nodes": (0..simulator.height).map(|t| {
                (0..simulator.vertical).map(|i| {
                    (0..simulator.horizontal).map(|j| {
                        let position = &pos!(t, i, j);
                        if self.is_node_exist(position) {
                            let [positive_node, negative_node, neutral_node] = self.get_node_unwrap(position);
                            Some(json!({
                                "position": position,
                                "all_positive_edges": positive_node.all_edges,
                                "positive_edges": positive_node.edges,
                                "all_negative_edges": negative_node.all_edges,
                                "negative_edges": negative_node.edges,
                                "all_neutral_edges": neutral_node.all_edges,
                                "neutral_edges": neutral_node.edges,
                            }))
                        } else {
                            None
                        }
                    }).collect::<Vec<Option<serde_json::Value>>>()
                }).collect::<Vec<Vec<Option<serde_json::Value>>>>()
            }).collect::<Vec<Vec<Vec<Option<serde_json::Value>>>>>()
        })
    }
}
