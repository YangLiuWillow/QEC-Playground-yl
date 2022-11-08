set terminal postscript eps color "Arial, 28"
set xlabel "Depolarizing Error Rate (p)" font "Arial, 28"
set ylabel "Logical Error Rate (p_L)" font "Arial, 28"
set grid ytics
set size 1,1

# data generating commands:
# cargo run --release -- tool fault_tolerant_benchmark [3] [0] [1e-1,5e-2,2e-2,1e-2,5e-3,2e-3,1e-3,5e-4,2e-4,1e-4,5e-5,2e-5,1e-5] -p0-m100000000 --shallow_error_on_bottom --only_count_logical_x
# cargo run --release -- tool fault_tolerant_benchmark [5] [0] [1e-1,5e-2,2e-2,1e-2,5e-3,2e-3,1e-3,5e-4,2e-4]-p0 -m100000000 --shallow_error_on_bottom --only_count_logical_x
# cargo run --release -- tool fault_tolerant_benchmark [7] [0] [1e-1,5e-2,2e-2,1e-2,5e-3,2e-3,1e-3] -p0 -m100000000-e1000 --shallow_error_on_bottom --only_count_logical_x
# cargo run --release -- tool fault_tolerant_benchmark [9] [0] [1e-1,5e-2,2e-2,1e-2,5e-3] -p0 -m100000000-e1000 --shallow_error_on_bottom --only_count_logical_x
# cargo run --release -- tool fault_tolerant_benchmark [11] [0] [1e-1,5e-2,2e-2,1e-2,5e-3] -p0 -m100000000-e200 --shallow_error_on_bottom --only_count_logical_x
# cargo run --release -- tool fault_tolerant_benchmark [13] [0] [1e-1,5e-2,2e-2,1e-2,5e-3] -p0 -m100000000-e200 --shallow_error_on_bottom --only_count_logical_x

set logscale x
set xrange [0.00001:0.1]
set xtics ("10^{-5}" 0.00001, "10^{-4}" 0.0001, "10^{-3}" 0.001, "10^{-2}" 0.01, "10^{-1}" 0.1)
set logscale y
set ytics ("10^{-8}" 0.00000001, "10^{-7}" 0.0000001, "10^{-6}" 0.000001, "10^{-5}" 0.00001, "10^{-4}" 0.0001, "10^{-3}" 0.001, "10^{-2}" 0.01, "10^{-1}" 0.1)
set yrange [0.00000001:1]
set key outside horizontal top center font "Arial, 24"

set style fill transparent solid 0.2 noborder

set output "MWPM_baseline.eps"

plot "d_3.txt" using 1:6 with linespoints lt rgb "red" linewidth 5 pointtype 6 pointsize 1.5 title "d = 3",\
    "d_5.txt" using 1:6 with linespoints lt rgb "blue" linewidth 5 pointtype 2 pointsize 1.5 title "d = 5",\
    "d_7.txt" using 1:6 with linespoints lt rgb "green" linewidth 5 pointtype 2 pointsize 1.5 title "d = 7",\
    "d_9.txt" using 1:6 with linespoints lt rgb "yellow" linewidth 5 pointtype 2 pointsize 1.5 title "d = 9",\
    "d_11.txt" using 1:6 with linespoints lt rgb "purple" linewidth 5 pointtype 2 pointsize 1.5 title "d = 11",\
    "d_13.txt" using 1:6 with linespoints lt rgb "orange" linewidth 5 pointtype 2 pointsize 1.5 title "d = 13"

system("ps2pdf -dEPSCrop MWPM_baseline.eps MWPM_baseline.pdf")

set size 1,0.75
set output "MWPM_baseline_w.eps"
replot
system("ps2pdf -dEPSCrop MWPM_baseline_w.eps MWPM_baseline_w.pdf")

set size 1,0.6
set output "MWPM_baseline_w_w.eps"
replot
system("ps2pdf -dEPSCrop MWPM_baseline_w_w.eps MWPM_baseline_w_w.pdf")
