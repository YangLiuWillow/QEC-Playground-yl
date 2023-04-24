use crate::code_builder;
use crate::noise_model_builder;
use crate::tool;
use crate::clap::{Parser, Subcommand};

#[derive(Parser, Clone)]
#[clap(author = clap::crate_authors!(", "))]
#[clap(version = env!("CARGO_PKG_VERSION"))]
#[clap(about = "Quantum Error Correction Playground")]
#[clap(color = clap::ColorChoice::Auto)]
#[clap(propagate_version = true)]
#[clap(subcommand_required = true)]
#[clap(arg_required_else_help = true)]
pub struct Cli {
    #[clap(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Clone)]
#[allow(clippy::large_enum_variant)]
pub enum Commands {
    /// testing features
    Test {
        #[clap(subcommand)]
        command: TestCommands,
    },
    /// built-in tests
    Tool {
        #[clap(subcommand)]
        command: ToolCommands,
    },
    /// HTTP server for decoding information
    Server(ServerParameters),
}

#[derive(Subcommand, Clone)]
#[allow(clippy::large_enum_variant)]
pub enum TestCommands {
    /// test for debug
    DebugTests,
    /// archived debug tests
    ArchivedDebugTests,
    /// run all tests
    All,
}

#[derive(Subcommand, Clone)]
#[allow(clippy::large_enum_variant)]
pub enum ToolCommands {
    /// built-in tests
    Benchmark(BenchmarkParameters),
}

#[derive(Parser, Clone)]
pub struct BenchmarkParameters {
    /// [di1,di2,di3,...,din] code distance of vertical axis
    #[clap(value_parser)]
    pub dis: String,
    /// [dj1,dj2,dj3,...,djn] code distance of horizontal axis, will use `dis` if not provided, otherwise must have exactly the same length as `dis`
    #[clap(long)]
    pub djs: Option<String>,
    /// [nm1,nm2,nm3,...,nmn] number of noisy measurement rounds, must have exactly the same length as `dis`; note that a perfect measurement is always capped at the end, so to simulate a single round of perfect measurement you should set this to 0
    #[clap(value_parser)]
    pub nms: String,
    /// [p1,p2,p3,...,pm] p = px + py + pz unless noise model has special interpretation of this value
    #[clap(value_parser)]
    pub ps: String,
    /// [p1,p2,p3,...,pm] defaults to ps, used to build the decoding graph
    #[clap(long)]
    pub ps_graph: Option<String>,
    /// [pe1,pe2,pe3,...,pem] erasure error rate, default to all 0
    #[clap(long)]
    pub pes: Option<String>,
    /// [pe1,pe2,pe3,...,pem] defaults to pes, used to build the decoding graph
    #[clap(long)]
    pub pes_graph: Option<String>,
    /// bias_eta = pz / (px + py) and px = py, px + py + pz = p. default to 1/2, which means px = pz = py
    #[clap(long, default_value_t = 0.5)]
    pub bias_eta: f64,
    /// maximum total repeats (previously known as `max_N`); 0 for infinity
    #[clap(short = 'm', long, default_value_t = 100000000)]
    pub max_repeats: usize,
    /// minimum failed cases; 0 for infinity
    #[clap(short = 'e', long, default_value_t = 10000)]
    pub min_failed_cases: usize,
    /// how many parallel threads to use. 0 means using number of CPUs - 1, by default single thread
    #[clap(short = 'p', long, default_value_t = 1)]
    pub parallel: usize,
    /// how many parallel threads to use when initializing decoders, default to be the same with `parallel`
    #[clap(long)]
    pub parallel_init: Option<usize>,
    /// code type, see code_builder.rs for more information
    #[clap(short = 'c', long, value_enum, default_value_t = code_builder::CodeType::StandardPlanarCode)]
    pub code_type: code_builder::CodeType,
    /// select the benchmarked decoder
    #[clap(long, value_enum, default_value_t = tool::BenchmarkDecoder::MWPM)]
    pub decoder: tool::BenchmarkDecoder,
    /// decoder configuration json, panic if any field is not recognized
    #[clap(long, default_value_t = ("{}").to_string())]
    pub decoder_config: String,
    /// ignore the logical error of i axis, e.g. logical Z error in standard CSS surface code
    #[clap(long, action)]
    pub ignore_logical_i: bool,
    /// ignore the logical error of j axis, e.g. logical X error in standard CSS surface code
    #[clap(long, action)]
    pub ignore_logical_j: bool,
    /// only print requested information without running the benchmark
    #[clap(long)]
    pub debug_print: Option<tool::BenchmarkDebugPrint>,
    /// for each configuration, give a maximum time to run (in second)
    #[clap(long)]
    pub time_budget: Option<f64>,
    /// log the runtime statistical information, given the path of the statistics log file
    #[clap(long)]
    pub log_runtime_statistics: Option<String>,
    /// log the error pattern in the statistics log file, which is useful when debugging rare cases but it can make the log file much larger
    #[clap(long, action)]
    pub log_error_pattern_when_logical_error: bool,
    /// possible noise models see noise_model_builder.rs
    #[clap(long)]
    pub noise_model: Option<noise_model_builder::NoiseModelBuilder>,
    /// a json object describing the noise model details
    #[clap(long, default_value_t = ("{}").to_string())]
    pub noise_model_configuration: String,
    /// wait for some time for threads to end, otherwise print out the unstopped threads and detach them; useful when debugging rare deadlock cases; if set to negative value, no timeout and no thread debug information recording for maximum performance
    #[clap(long, default_value_t = 60.)]
    pub thread_timeout: f64,
    /// use brief edges in model graph to save memories; it will drop the error pattern and correction as long as another one is more probable
    #[clap(long, action)]
    pub use_brief_edge: bool,
    /// arbitrary label information
    #[clap(long, default_value_t = ("").to_string())]
    pub label: String,
    /// if provided, will fetch a Json from temporary store in web module to update noise model
    #[clap(long)]
    pub load_noise_model_from_temporary_store: Option<usize>,
    /// if provided, will fetch a Json from file to update noise model
    #[clap(long)]
    pub load_noise_model_from_file: Option<String>,
    /// logging to the default visualizer file at visualize/data/visualizer.json
    #[clap(long, action)]
    pub enable_visualizer: bool,
    /// visualizer file at visualize/data/<visualizer_filename>.json
    #[clap(long)]
    pub visualizer_filename: Option<String>,
    /// when visualizer is enabled, only record failed cases; useful when trying to debug rare failed cases, e.g. finding the lowest number of physical errors that causes a logical error
    #[clap(long, action)]
    pub visualizer_skip_success_cases: bool,
    /// include model graph in the visualizer file
    #[clap(long, action)]
    pub visualizer_model_graph: bool,
    /// include model hypergraph in the visualizer file
    #[clap(long, action)]
    pub visualizer_model_hypergraph: bool,
}

#[derive(Parser, Clone)]
pub struct ServerParameters {
    /// listening on <addr>:<port>, default to 8066
    #[clap(short = 'p', long, default_value_t = 8066)]
    pub port: i32,
    /// listening on <addr>:<port>, default to "127.0.0.1"
    #[clap(short = 'a', long, default_value_t = ("127.0.0.1").to_string())]
    pub addr: String,
    /// root url
    #[clap(short = 'r', long, default_value_t = ("/").to_string())]
    pub root_url: String,
}
