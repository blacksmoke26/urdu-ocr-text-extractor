"""Diagnostics for CUDA compatibility issues."""
import torch

print("PyTorch version:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())

if torch.cuda.is_available():
    print("CUDA version (compiled):", torch.version.cuda)
    print("cuDNN version:", torch.backends.cudnn.version())
    print("GPU name:", torch.cuda.get_device_name(0))
    print("GPU count:", torch.cuda.device_count())
    prop = torch.cuda.get_device_properties(0)
    print("Compute capability:", f"{prop.major}.{prop.minor}")
    print("Total memory (GB):", prop.total_memory / (1024 ** 3))

    # Quick kernel test
    try:
        x = torch.randn(1, 3, 32, 32, device="cuda")
        y = torch.nn.functional.relu(x)
        print("CUDA kernel test: PASSED")
    except RuntimeError as e:
        print(f"CUDA kernel test: FAILED — {e}")
else:
    print("CUDA is NOT available. PyTorch was installed without CUDA support.")
    print()
    print("To install PyTorch with CUDA, run:")
    print('  pip uninstall torch torchvision -y')
    print("  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124")
