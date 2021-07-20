import sys, os, json, math
import scipy.stats

fixed_configuration = None
configurations = []
data_vec = []

with open("decoding_time_UF.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()
    for line in lines:
        line = line.strip(" \r\n")
        if line == "":  # ignore empty line
            continue
        if line[:3] == "#f ":
            fixed_configuration = json.loads(line[3:])
        elif line[:2] == "# ":
            configurations.append(json.loads(line[2:]))
            data_vec.append([])
        else:
            data_vec[-1].append(json.loads(line))

print(fixed_configuration)

def average(lst):
    return sum(lst) / len(lst)

fitting_data = []

for i in range(0, len(configurations)):
    config = configurations[i]
    vec = data_vec[i]
    print(config)
    error_count = 0
    success_count = 0
    # these only accounts successful cases
    time_build_decoders_vec = []
    time_run_to_stable_vec = []
    time_build_decoders_run_to_stable_vec = []
    for e in vec:
        if e["error"]:
            error_count += 1
        else:
            success_count += 1
            time_build_decoders_vec.append(e["time_build_decoders"])
            time_run_to_stable_vec.append(e["time_run_to_stable"])
            time_build_decoders_run_to_stable_vec.append(e["time_build_decoders"] + e["time_run_to_stable"])
    upper_idx = min(max(0, int(success_count - error_count * 0.1)), success_count - 1)  # this will lead to error rate of 110% x original error rate
    print(f"error: {error_count}, success_count: {success_count}, error_rate: {error_count/(error_count+success_count)}")
    print(f"time_build_decoders: {average(time_build_decoders_vec)}, {sorted(time_build_decoders_vec)[upper_idx]}")
    print(f"time_run_to_stable: {average(time_run_to_stable_vec)}, {sorted(time_run_to_stable_vec)[upper_idx]}")
    print(f"time_build_decoders_run_to_stable: {average(time_build_decoders_run_to_stable_vec)}, {sorted(time_build_decoders_run_to_stable_vec)[upper_idx]}")
    if config["di"] >= 4:
        fitting_data.append((config["di"], average(time_run_to_stable_vec)))

print(fitting_data)
X = [math.log(e[0]) for e in fitting_data]
Y = [math.log(e[1]) for e in fitting_data]
slope, intercept, r, _, _ = scipy.stats.linregress(X, Y)
print(f"slope = {slope}")
print(f"intercept = {intercept}")
print(f"r_square = {r**2}")
