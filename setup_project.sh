#!/usr/bin/env bash
# setup_project.sh
# Run from inside your cloned HeroShooter/ repo directory

set -euo pipefail

echo "Creating HeroShooter project structure..."

# ── Directory structure ────────────────────────────────────────────────────────
declare -a DIRS=(
    "app/src/main/cpp/main"
    "app/src/main/cpp/ecs/components"
    "app/src/main/cpp/ecs/systems"
    "app/src/main/cpp/rendering"
    "app/src/main/cpp/physics"
    "app/src/main/cpp/audio"
    "app/src/main/cpp/network"
    "app/src/main/cpp/input"
    "app/src/main/cpp/states"
    "app/src/main/cpp/assets"
    "app/src/main/cpp/debug"
    "app/src/main/cpp/memory"
    "app/src/main/cpp/threading"
    "app/src/main/cpp/utils"
    "app/src/main/java/com/heroshooter/engine"
    "app/src/main/assets/shaders"
    "app/src/main/res/xml"
    "scripts"
    "third_party"
    ".github/workflows"
)

for dir in "${DIRS[@]}"; do
    mkdir -p "$dir"
    echo "  Created: $dir"
done

# ── File list with placeholder content ────────────────────────────────────────
declare -A FILES

# Gradle
FILES["settings.gradle.kts"]="// TODO: paste settings.gradle.kts content"
FILES["build.gradle.kts"]="// TODO: paste root build.gradle.kts content"
FILES["gradle.properties"]="# TODO: paste gradle.properties content"
FILES["app/build.gradle.kts"]="// TODO: paste app/build.gradle.kts content"
FILES["app/proguard-rules.pro"]="# TODO: paste proguard-rules.pro content"

# Manifests and resources
FILES["app/src/main/AndroidManifest.xml"]="<!-- TODO: paste AndroidManifest.xml -->"
FILES["app/src/main/res/xml/game_mode_config.xml"]="<!-- TODO: paste game_mode_config.xml -->"

# Kotlin
FILES["app/src/main/java/com/heroshooter/engine/MainActivity.kt"]="// TODO: paste MainActivity.kt"

# CMake
FILES["app/src/main/cpp/CMakeLists.txt"]="# TODO: paste CMakeLists.txt"

# C++ — main
FILES["app/src/main/cpp/main/android_main.cpp"]="// TODO: paste android_main.cpp"
FILES["app/src/main/cpp/main/GameEngine.h"]="// TODO: paste GameEngine.h"
FILES["app/src/main/cpp/main/GameEngine.cpp"]="// TODO: paste GameEngine.cpp"

# C++ — ECS components
FILES["app/src/main/cpp/ecs/components/TransformComponent.h"]="// TODO"
FILES["app/src/main/cpp/ecs/components/TransformComponent.cpp"]="// TODO"
FILES["app/src/main/cpp/ecs/components/MovementComponent.h"]="// TODO"
FILES["app/src/main/cpp/ecs/components/RenderComponent.h"]="// TODO"
FILES["app/src/main/cpp/ecs/components/PhysicsComponent.h"]="// TODO"
FILES["app/src/main/cpp/ecs/components/NetworkComponent.h"]="// TODO"

# C++ — ECS core
FILES["app/src/main/cpp/ecs/EntityManager.h"]="// TODO"
FILES["app/src/main/cpp/ecs/EntityManager.cpp"]="// TODO"

# C++ — ECS systems
FILES["app/src/main/cpp/ecs/systems/MovementSystem.h"]="// TODO"
FILES["app/src/main/cpp/ecs/systems/MovementSystem.cpp"]="// TODO"
FILES["app/src/main/cpp/ecs/systems/PhysicsSystem.h"]="// TODO"
FILES["app/src/main/cpp/ecs/systems/PhysicsSystem.cpp"]="// TODO"
FILES["app/src/main/cpp/ecs/systems/RenderSystem.h"]="// TODO"
FILES["app/src/main/cpp/ecs/systems/RenderSystem.cpp"]="// TODO"
FILES["app/src/main/cpp/ecs/systems/NetworkSystem.h"]="// TODO"
FILES["app/src/main/cpp/ecs/systems/NetworkSystem.cpp"]="// TODO"

# C++ — Rendering
FILES["app/src/main/cpp/rendering/VulkanRenderer.h"]="// TODO"
FILES["app/src/main/cpp/rendering/VulkanRenderer.cpp"]="// TODO"
FILES["app/src/main/cpp/rendering/VulkanPipeline.h"]="// TODO"
FILES["app/src/main/cpp/rendering/VulkanPipeline.cpp"]="// TODO"
FILES["app/src/main/cpp/rendering/VulkanBuffer.h"]="// TODO"
FILES["app/src/main/cpp/rendering/VulkanBuffer.cpp"]="// TODO"
FILES["app/src/main/cpp/rendering/ShaderManager.h"]="// TODO"
FILES["app/src/main/cpp/rendering/ShaderManager.cpp"]="// TODO"

# C++ — Physics
FILES["app/src/main/cpp/physics/PhysicsWorld.h"]="// TODO"
FILES["app/src/main/cpp/physics/PhysicsWorld.cpp"]="// TODO"
FILES["app/src/main/cpp/physics/CollisionLayers.h"]="// TODO"

# C++ — Audio
FILES["app/src/main/cpp/audio/AudioEngine.h"]="// TODO"
FILES["app/src/main/cpp/audio/AudioEngine.cpp"]="// TODO"

# C++ — Network
FILES["app/src/main/cpp/network/NetworkManager.h"]="// TODO"
FILES["app/src/main/cpp/network/NetworkManager.cpp"]="// TODO"
FILES["app/src/main/cpp/network/GamePacket.h"]="// TODO"
FILES["app/src/main/cpp/network/ClientAdapter.h"]="// TODO"

# C++ — Input
FILES["app/src/main/cpp/input/InputManager.h"]="// TODO"
FILES["app/src/main/cpp/input/InputManager.cpp"]="// TODO"

# C++ — States
FILES["app/src/main/cpp/states/GameStateManager.h"]="// TODO"
FILES["app/src/main/cpp/states/GameStateManager.cpp"]="// TODO"
FILES["app/src/main/cpp/states/LoadingState.h"]="// TODO"
FILES["app/src/main/cpp/states/LoadingState.cpp"]="// TODO"
FILES["app/src/main/cpp/states/MatchState.h"]="// TODO"
FILES["app/src/main/cpp/states/MatchState.cpp"]="// TODO"

# C++ — Assets
FILES["app/src/main/cpp/assets/AssetManager.h"]="// TODO"
FILES["app/src/main/cpp/assets/AssetManager.cpp"]="// TODO"

# C++ — Debug
FILES["app/src/main/cpp/debug/DebugRenderer.h"]="// TODO"
FILES["app/src/main/cpp/debug/DebugRenderer.cpp"]="// TODO"

# C++ — Memory
FILES["app/src/main/cpp/memory/PoolAllocator.h"]="// TODO"
FILES["app/src/main/cpp/memory/PoolAllocator.cpp"]="// TODO"
FILES["app/src/main/cpp/memory/LinearAllocator.h"]="// TODO"
FILES["app/src/main/cpp/memory/LinearAllocator.cpp"]="// TODO"
FILES["app/src/main/cpp/memory/MemoryTracker.h"]="// TODO"

# C++ — Threading
FILES["app/src/main/cpp/threading/ThreadPool.h"]="// TODO"
FILES["app/src/main/cpp/threading/ThreadPool.cpp"]="// TODO"
FILES["app/src/main/cpp/threading/JobSystem.h"]="// TODO"
FILES["app/src/main/cpp/threading/JobSystem.cpp"]="// TODO"
FILES["app/src/main/cpp/threading/AtomicQueue.h"]="// TODO"

# C++ — Utils
FILES["app/src/main/cpp/utils/Logger.h"]="// TODO"
FILES["app/src/main/cpp/utils/Timer.h"]="// TODO"
FILES["app/src/main/cpp/utils/Timer.cpp"]="// TODO"

# Shaders
FILES["app/src/main/assets/shaders/mesh.vert"]="// TODO: paste mesh.vert"
FILES["app/src/main/assets/shaders/mesh.frag"]="// TODO: paste mesh.frag"

# CI
FILES[".github/workflows/build.yml"]="# TODO: paste build.yml"

# Scripts
FILES["Makefile"]="# TODO: paste Makefile"
FILES["scripts/build_and_run.sh"]="#!/bin/bash\n# TODO: paste build_and_run.sh"
FILES["scripts/symbolicate_crash.sh"]="#!/bin/bash\n# TODO: paste symbolicate_crash.sh"

# .gitignore
FILES[".gitignore"]="*.iml
.gradle/
local.properties
.idea/
.DS_Store
/build
/captures
.externalNativeBuild
.cxx/
*.apk
*.aab
*.keystore
app/build/
third_party/entt/
third_party/jolt/
third_party/yojimbo/
tombstones/"

# README
FILES["README.md"]="# HeroShooter Engine

Production-grade Android NDK game engine for a 3D multiplayer hero shooter.

## Stack
- **Rendering**: Vulkan 1.1 + Swappy frame pacing
- **ECS**: EnTT v3.13
- **Physics**: Jolt Physics v5.1
- **Audio**: Oboe (AAudio backend)
- **Networking**: Yojimbo (reliable UDP)
- **Entry Point**: AGDK GameActivity

## Build
\`\`\`bash
./gradlew assembleDebug
\`\`\`

## Requirements
- NDK 27.1.12297006
- CMake 3.28+
- Android API 26+ (minSdk)
- Vulkan 1.1 capable device
"

# ── Write all files ────────────────────────────────────────────────────────────
for filepath in "${!FILES[@]}"; do
    # Create parent directory if needed
    dirpath=$(dirname "$filepath")
    [ "$dirpath" != "." ] && mkdir -p "$dirpath"

    # Only write if file doesn't already exist
    if [ ! -f "$filepath" ]; then
        printf '%b' "${FILES[$filepath]}" > "$filepath"
        echo "  Created: $filepath"
    else
        echo "  Skipped (exists): $filepath"
    fi
done

# Make scripts executable
chmod +x scripts/build_and_run.sh 2>/dev/null || true
chmod +x scripts/symbolicate_crash.sh 2>/dev/null || true

echo ""
echo "================================================"
echo "  Structure created successfully!"
echo "  Next steps:"
echo "  1. Fill in each TODO file with the code"
echo "     from the chat conversation"
echo "  2. git add ."
echo "  3. git commit -m 'Initial engine structure'"
echo "  4. git push origin main"
echo "================================================"
