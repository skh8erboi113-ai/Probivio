kllllllllllllk to t3// app/src/main/cpp/ecs/components/RenderComponent.h
#pragma once

#include <cstdint>

namespace hs {

// Opaque handles — actual GPU resources live in VulkanRenderer
using MeshId     = uint32_t;
using MaterialId = uint32_t;
using TextureId  = uint32_t;

constexpr MeshId     INVALID_MESH_ID     = UINT32_MAX;
constexpr MaterialId INVALID_MATERIAL_ID = UINT32_MAX;

// ─────────────────────────────────────────────────────────────────────────────
// RenderComponent
//
// Associates an entity with its GPU-resident mesh and material.
// The RenderSystem queries all entities with (TransformComponent, RenderComponent)
// and submits draw calls to the Vulkan command buffer.
//
// LOD levels allow the render system to switch mesh detail based on camera
// distance — critical for a 60-player multiplayer scene.
// ─────────────────────────────────────────────────────────────────────────────
struct RenderComponent {
    MeshId      meshId      = INVALID_MESH_ID;
    MaterialId  materialId  = INVALID_MATERIAL_ID;

    // LOD mesh variants (index 0 = highest detail)
    // Up to 4 LOD levels; INVALID_MESH_ID = not available
    MeshId      lodMeshIds[4] = {
        INVALID_MESH_ID, INVALID_MESH_ID,
        INVALID_MESH_ID, INVALID_MESH_ID
    };
    float       lodDistances[4] = { 0.0f, 20.0f, 50.0f, 100.0f };

    // Render flags
    bool        castsShadow     = true;
    bool        receivesShadow  = true;
    bool        visible we        = true;

    // Instancing: if instanceGroupId != 0, this entity is part of an
    // instanced draw batch (e.g., foliage, crowd NPCs)
    uint32_t    instanceGroupId = 0;
};

} // namespace hs for to tohe
