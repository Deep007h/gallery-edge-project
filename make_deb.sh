#!/bin/bash
set -e

echo "Creating debian build directories..."
BUILD_DIR="/home/deep007h/mobile_llm/deb_build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/usr/bin"
mkdir -p "$BUILD_DIR/usr/share/applications"
mkdir -p "$BUILD_DIR/usr/share/pixmaps"
mkdir -p "$BUILD_DIR/usr/share/gallery-edge"

echo "Creating DEBIAN/control file..."
cat << 'EOF' > "$BUILD_DIR/DEBIAN/control"
Package: gallery-edge
Version: 1.0.0
Section: utils
Priority: optional
Architecture: amd64
Maintainer: DeepMind Coding Team <deep007h@deepmind.com>
Depends: python3, python3-pip, python3-venv, curl, wget
Description: Gallery Edge Linux Client
 A 1:1 Linux desktop replica of the Google AI Edge Gallery Android app.
 Runs local on-device LLMs (LiteRT-LM models) natively with GPU/CPU support.
EOF

echo "Creating launcher script..."
cat << 'EOF' > "$BUILD_DIR/usr/bin/gallery-edge"
#!/bin/bash
# Gallery Edge launcher script

# Setup local user directories
VENV_DIR="$HOME/.local/share/gallery-edge/venv"
mkdir -p "$HOME/.local/share/gallery-edge"

if [ ! -d "$VENV_DIR" ]; then
    echo "First time launch: Initializing python environment..."
    python3 -m venv "$VENV_DIR"
    
    echo "Installing backend dependencies..."
    "$VENV_DIR/bin/pip" install --upgrade pip
    "$VENV_DIR/bin/pip" install fastapi uvicorn websockets requests
    
    # Try to install pywebview. If it fails, the app will fallback to system browser
    "$VENV_DIR/bin/pip" install pywebview || echo "Warning: pywebview installation skipped, will fallback to browser window"
    
    # Install local LiteRT-LM wheel
    echo "Installing LiteRT-LM engine..."
    "$VENV_DIR/bin/pip" install /usr/share/gallery-edge/litert_lm_api-0.13.1-py3-none-manylinux_2_27_x86_64.whl
fi

# Run uvicorn server + frontend launcher
echo "Starting Gallery Edge..."
exec "$VENV_DIR/bin/python" /usr/share/gallery-edge/main.py
EOF
chmod +x "$BUILD_DIR/usr/bin/gallery-edge"

echo "Creating desktop launcher shortcut..."
cat << 'EOF' > "$BUILD_DIR/usr/share/applications/gallery-edge.desktop"
[Desktop Entry]
Name=Gallery Edge
Comment=Run local on-device Edge LLMs
Exec=/usr/bin/gallery-edge
Icon=/usr/share/pixmaps/gallery-edge.svg
Terminal=false
Type=Application
Categories=Development;Utility;
EOF

echo "Copying application assets..."
cp /home/deep007h/mobile_llm/main.py "$BUILD_DIR/usr/share/gallery-edge/"
cp /home/deep007h/mobile_llm/inference.py "$BUILD_DIR/usr/share/gallery-edge/"
cp /home/deep007h/mobile_llm/models.py "$BUILD_DIR/usr/share/gallery-edge/"
cp /home/deep007h/mobile_llm/model_allowlist.json "$BUILD_DIR/usr/share/gallery-edge/"
cp /home/deep007h/mobile_llm/litert_lm_api-0.13.1-py3-none-manylinux_2_27_x86_64.whl "$BUILD_DIR/usr/share/gallery-edge/"

# Copy frontend assets
cp -r /home/deep007h/mobile_llm/frontend/dist "$BUILD_DIR/usr/share/gallery-edge/frontend"

# Copy icon
cp /home/deep007h/mobile_llm/frontend/dist/favicon.svg "$BUILD_DIR/usr/share/pixmaps/gallery-edge.svg"

echo "Building Debian package..."
dpkg-deb --build "$BUILD_DIR" /home/deep007h/mobile_llm/gallery-edge_1.0.0_amd64.deb

echo "Clean up build directory..."
rm -rf "$BUILD_DIR"

echo "Debian package successfully built at /home/deep007h/mobile_llm/gallery-edge_1.0.0_amd64.deb"
