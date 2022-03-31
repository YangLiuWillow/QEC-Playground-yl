//! tailored surface code MWPM decoder
//! 

use serde::{Serialize, Deserialize};
use super::simulator::*;
use super::error_model::*;
use super::model_graph::*;
use super::tailored_model_graph::*;
use super::tailored_complete_model_graph::*;
use super::serde_json;
use std::sync::{Arc};
use super::mwpm_decoder::*;
use std::time::Instant;
use super::blossom_v;

/// MWPM decoder, initialized and cloned for multiple threads
#[derive(Debug, Clone, Serialize)]
pub struct TailoredMWPMDecoder {
    /// model graph is immutably shared
    pub model_graph: Arc<TailoredModelGraph>,
    /// complete model graph each thread maintain its own precomputed data
    pub complete_model_graph: CompleteTailoredModelGraph,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TailoredMWPMDecoderConfig {
    /// build complete model graph at first, but this will consume O(N^2) memory and increase initialization time,
    /// disable this when you're simulating large code
    #[serde(alias = "pcmg")]  // abbreviation
    #[serde(default = "mwpm_default_configs::precompute_complete_model_graph")]
    pub precompute_complete_model_graph: bool,
    /// weight function, by default using [`WeightFunction::AutotuneImproved`]
    #[serde(alias = "wf")]  // abbreviation
    #[serde(default = "mwpm_default_configs::weight_function")]
    pub weight_function: WeightFunction,
}

impl TailoredMWPMDecoder {
    /// create a new MWPM decoder with decoder configuration
    pub fn new(simulator: &Simulator, error_model: &ErrorModel, decoder_configuration: &serde_json::Value) -> Self {
        // read attribute of decoder configuration
        let config: MWPMDecoderConfig = serde_json::from_value(decoder_configuration.clone()).unwrap();
        // build model graph
        let mut simulator = simulator.clone();
        let mut model_graph = TailoredModelGraph::new(&simulator);
        model_graph.build(&mut simulator, &error_model, &config.weight_function);
        // build complete model graph
        let mut complete_model_graph = CompleteTailoredModelGraph::new(&simulator, &model_graph);
        complete_model_graph.precompute(&simulator, &model_graph, config.precompute_complete_model_graph);
        Self {
            model_graph: Arc::new(model_graph),
            complete_model_graph: complete_model_graph,
        }
    }

    pub fn decode(&mut self, sparse_measurement: &SparseMeasurement) -> (SparseCorrection, serde_json::Value) {
        let mut correction = SparseCorrection::new();
        (correction, json!({

        }))
    }
}

