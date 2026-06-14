import litert_lm
import inspect

print("tool_from_function signature:")
print(inspect.signature(litert_lm.tool_from_function))

print("\nListing elements inside litert_lm.tools:")
import litert_lm.tools
print(dir(litert_lm.tools))
