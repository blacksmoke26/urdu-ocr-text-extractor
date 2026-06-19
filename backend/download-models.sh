#!/bin/bash

# URLs of the files to be downloaded
urls=(
  "https://huggingface.co/spaces/abdur75648/UrduOCR-UTRNet/resolve/main/best_norm_ED.pth"
  "https://huggingface.co/spaces/abdur75648/UrduOCR-UTRNet/resolve/main/yolov8m_UrduDoc.pt"
)

# Create models directory if it doesn't exist
mkdir -p models

# Download each file
for url in "${urls[@]}"; do
  echo "Downloading $url..."
  curl -L -o "models/$(basename "$url")" "$url"
done

echo "All files downloaded successfully."
