// Simple Stata test file
clear
set obs 100
gen x = rnormal()
gen y = 2*x + rnormal()
summarize
correlate
regress y x
scatter y x 