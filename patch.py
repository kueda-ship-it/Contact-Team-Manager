import os

app_js_path = 'app.js'
snippet_js_path = 'snippet.js'

# Read original file
with open(app_js_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Read snippet
with open(snippet_js_path, 'r', encoding='utf-8') as f:
    snippet_lines = f.readlines()

# Verify integrity (Line indices are 0-based, so line 1984 is index 1983)
# Target deletion: Lines 1984 to 2029 (Indices 1983 to 2028 inclusive)
start_idx = 1983
end_idx = 2029

print(f"Original line {start_idx+1}: {lines[start_idx].strip()}")
print(f"Original line {end_idx}: {lines[end_idx-1].strip()}")

# The range to delete is from start_idx up to, but not including, the line AFTER the block
# We want to remove lines 1984 through 2029.
# 1984 is index 1983.
# 2029 is index 2028.
# So slice is [1983:2029] (since Python slice end is exclusive)
# Let's verify: 
# lines[1983] is the first bad line.
# lines[2028] is the last bad line ('}').
# So we delete lines[1983:2029].

if "showMentionSuggestions" not in lines[start_idx]:
    print("WARNING: Line 1984 does not start with expected function! Aborting safe patch.")
    exit(1)

# Splice
new_lines = lines[:start_idx] + snippet_lines + lines[end_idx:]

# Write back
with open(app_js_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully patched app.js")
