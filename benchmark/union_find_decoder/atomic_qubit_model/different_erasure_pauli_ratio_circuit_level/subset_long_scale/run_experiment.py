import os, sys
qec_playground_root_dir = os.popen("git rev-parse --show-toplevel").read().strip(" \r\n")
rust_dir = os.path.join(qec_playground_root_dir, "backend", "rust")
fault_toleran_MWPM_dir = os.path.join(qec_playground_root_dir, "benchmark", "fault_tolerant_MWPM")
sys.path.insert(0, fault_toleran_MWPM_dir)
from automated_threshold_evaluation import qec_playground_fault_tolerant_MWPM_simulator_runner_vec_command
from automated_threshold_evaluation import run_qec_playground_command_get_stdout

# read in the threshold
thresholds = []
with open("../thresholds.txt", "r", encoding="utf8") as f:
    lines = f.readlines()
    for line in lines:
        line = line.strip(" \r\n")
        if line == "":
            continue
        pauli_ratio, threshold, dev = line.split(" ")
        if pauli_ratio not in ["0", "0.01", "0.05", "0.1", "1"]:
            continue
        thresholds.append((float(pauli_ratio), float(threshold), float(dev)))

print("subset:")
print(thresholds)

di = 5

for pauli_ratio, threshold, _ in thresholds:
    print(f"running pauli_ratio = {pauli_ratio}, threshold = {threshold}...")
    p_vec = [threshold * (0.8 ** i) for i in range(200)]
    min_error_cases = 6000
    max_N = 100000000

    filename = os.path.join(os.path.dirname(__file__), f"pauli_ratio_{pauli_ratio}.txt")

    UF_parameters = f"-p0 --decoder UF --max_half_weight 100 --time_budget 3600 --use_xzzx_code --error_model OnlyGateErrorCircuitLevel".split(" ")  # a maximum 1hour for each point

    results = []
    for p in p_vec:
        p_pauli = p * pauli_ratio
        p_erasure = p * (1 - pauli_ratio)
        UF_command = qec_playground_fault_tolerant_MWPM_simulator_runner_vec_command([p_pauli], [di], [di], [di], UF_parameters + ["--pes", f"[{p_erasure}]"], max_N=max_N, min_error_cases=min_error_cases)
        print(" ".join(UF_command))

        # run experiment
        stdout, returncode = run_qec_playground_command_get_stdout(UF_command)
        print("\n" + stdout)
        assert returncode == 0, "command fails..."

        # full result
        full_result = stdout.strip(" \r\n").split("\n")[-1]
        lst = full_result.split(" ")
        error_count = int(lst[4])
        error_rate = float(lst[5])
        confidence_interval = float(lst[7])

        # record result
        print_result = f"{p / threshold} {p} " + full_result
        results.append(print_result)
        print(print_result)

        if error_count < min_error_cases * 0.1:
            break  # next is not trust-worthy, ignore every p behind it

    print("\n\n")
    print("\n".join(results))
    print("\n\n")

    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n".join(results) + "\n")