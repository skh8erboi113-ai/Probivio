// app/src/main/cpp/assets/AssetManager.cpp
#include "AssetManager.h"
#include "../utils/Logger.h"

#include <android/asset_manager.h>
#include <cmath>
#include <cstring>

namespace hs {

// ─────────────────────────────────────────────────────────────────────────────
bool AssetManager::init(
    AAssetManager*   androidAssets,
    VkDevice         device,
    VkPhysicalDevice physDevice,
    VkCommandPool    commandPool,
    VkQueue          transferQueue,
    RenderSystem&    renderSystem)
{
    m_androidAssets  = androidAssets;
    m_device         = device;
    m_physDevice     = physDevice;
    m_commandPool    = commandPool;
    m_transferQueue  = transferQueue;
    m_renderSystem   = &renderSystem;

    LOG_INFO("AssetManager: initialised");
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural mesh generators — used for prototyping and physics debug shapes
// ─────────────────────────────────────────────────────────────────────────────
uint32_t AssetManager::createBoxMesh(float hx, float hy, float hz) {
    const std::string key = "box_" + std::to_string(hx) + "_"
                          + std::to_string(hy) + "_" + std::to_string(hz);
    auto it = m_meshCache.find(key);
    if (it != m_meshCache.end()) return it->second;

    MeshData data;
    data.name          = key;
    data.boundingRadius = std::sqrt(hx*hx + hy*hy + hz*hz);

    // 6 faces × 4 vertices × (3+3+2+4) floats = 6×4×12 = 288 floats
    // Face normals for a box (each face has a constant normal)
    struct FaceDef {
        float nx, ny, nz;           // Normal
        float ax, ay, az;           // Right axis
        float bx, by, bz;           // Up axis
    };
    const FaceDef faces[6] = {
        {  0,  0,  1,   1,0,0,   0,1,0 },  // +Z front
        {  0,  0, -1,  -1,0,0,   0,1,0 },  // -Z back
        {  1,  0,  0,   0,0,-1,  0,1,0 },  // +X right
        { -1,  0,  0,   0,0,1,   0,1,0 },  // -X left
        {  0,  1,  0,   1,0,0,   0,0,-1},  // +Y top
        {  0, -1,  0,   1,0,0,   0,0,1 },  // -Y bottom
    };

    for (const auto& f : faces) {
        const uint32_t base = static_cast<uint32_t>(data.vertices.size() / 12);

        // 4 corners of this face
        const float corners[4][2] = {{-1,-1},{1,-1},{1,1},{-1,1}};
        for (const auto& c : corners) {
            // Position
            data.vertices.push_back(f.nx * (f.nx!=0?hx:0) + f.ax*c[0]*(f.ax!=0?hx:hy!=0?hy:hz) + f.bx*c[1]*hy);
            data.vertices.push_back(f.ny * hy + f.ay*c[0]*hx + f.by*c[1]*hz);
            data.vertices.push_back(f.nz * hz + f.az*c[0]*hx + f.bz*c[1]*hy);
            // Normal
            data.vertices.push_back(f.nx);
            data.vertices.push_back(f.ny);
            data.vertices.push_back(f.nz);
            // UV
            data.vertices.push_back((c[0] + 1.0f) * 0.5f);
            data.vertices.push_back((c[1] + 1.0f) * 0.5f);
            // Tangent (simplified: use right axis)
            data.vertices.push_back(f.ax);
            data.vertices.push_back(f.ay);
            data.vertices.push_back(f.az);
            data.vertices.push_back(1.0f); // Handedness
        }

        // Two triangles per face
        data.indices.push_back(base+0); data.indices.push_back(base+1); data.indices.push_back(base+2);
        data.indices.push_back(base+0); data.indices.push_back(base+2); data.indices.push_back(base+3);
    }

    uint32_t meshId = INVALID_MESH_ID;
    if (uploadMesh(data, &meshId)) {
        m_meshCache[key] = meshId;
    }
    return meshId;
}

// ─────────────────────────────────────────────────────────────────────────────
uint32_t AssetManager::createSphereMesh(float radius, int segments) {
    const std::string key = "sphere_" + std::to_string(radius)
                          + "_" + std::to_string(segments);
    auto it = m_meshCache.find(key);
    if (it != m_meshCache.end()) return it->second;

    MeshData data;
    data.name           = key;
    data.boundingRadius = radius;

    // UV sphere: (segments+1) latitude rings × (segments+1) longitude columns
    const int rings = segments;
    const int cols  = segments;

    for (int r = 0; r <= rings; ++r) {
        const float phi = 3.14159f * r / rings;    // [0, π]
        for (int c = 0; c <= cols; ++c) {
            const float theta = 2.0f * 3.14159f * c / cols; // [0, 2π]

            const float x = std::sin(phi) * std::cos(theta);
            const float y = std::cos(phi);
            const float z = std::sin(phi) * std::sin(theta);

            // Position
            data.vertices.push_back(x * radius);
            data.vertices.push_back(y * radius);
            data.vertices.push_back(z * radius);
            // Normal (unit sphere: position == normal)
            data.vertices.push_back(x);
            data.vertices.push_back(y);
            data.vertices.push_back(z);
            // UV
            data.vertices.push_back(static_cast<float>(c) / cols);
            data.vertices.push_back(static_cast<float>(r) / rings);
            // Tangent (∂position/∂theta, normalised)
            const float tx = -std::sin(theta);
            const float tz =  std::cos(theta);
            data.vertices.push_back(tx);
            data.vertices.push_back(0.0f);
            data.vertices.push_back(tz);
            data.vertices.push_back(1.0f);
        }
    }

    // Indices
    for (int r = 0; r < rings; ++r) {
        for (int c = 0; c < cols; ++c) {
            const uint32_t i0 = r       * (cols + 1) + c;
            const uint32_t i1 = r       * (cols + 1) + c + 1;
            const uint32_t i2 = (r + 1) * (cols + 1) + c;
            const uint32_t i3 = (r + 1) * (cols + 1) + c + 1;

            data.indices.push_back(i0);
            data.indices.push_back(i1);
            data.indices.push_back(i2);
            data.indices.push_back(i1);
            data.indices.push_back(i3);
            data.indices.push_back(i2);
        }
    }

    uint32_t meshId = INVALID_MESH_ID;
    if (uploadMesh(data, &meshId)) {
        m_meshCache[key] = meshId;
    }
    return meshId;
}

// ─────────────────────────────────────────────────────────────────────────────
bool AssetManager::uploadMesh(const MeshData& data, uint32_t* outId) {
    if (data.vertices.empty() || data.indices.empty()) return false;

    MeshBuffer meshBuf;
    meshBuf.vertexCount     = static_cast<uint32_t>(
        data.vertices.size() / 12);  // 12 floats per vertex
    meshBuf.indexCount      = static_cast<uint32_t>(data.indices.size());
    meshBuf.boundingRadius  = data.boundingRadius;

    const VkDeviceSize vbSize = data.vertices.size() * sizeof(float);
    const VkDeviceSize ibSize = data.indices.size()  * sizeof(uint32_t);

    // Upload vertex buffer to GPU
    if (!VulkanBuffer::uploadToDeviceLocal(
            m_device, m_physDevice, m_commandPool, m_transferQueue,
            meshBuf.vertexBuffer, data.vertices.data(), vbSize,
            VK_BUFFER_USAGE_VERTEX_BUFFER_BIT))
    {
        LOG_ERROR("AssetManager: vertex buffer upload failed for '%s'",
                  data.name.c_str());
        return false;
    }

    // Upload index buffer to GPU
    if (!VulkanBuffer::uploadToDeviceLocal(
            m_device, m_physDevice, m_commandPool, m_transferQueue,
            meshBuf.indexBuffer, data.indices.data(), ibSize,
            VK_BUFFER_USAGE_INDEX_BUFFER_BIT))
    {
        LOG_ERROR("AssetManager: index buffer upload failed for '%s'",
                  data.name.c_str());
        meshBuf.vertexBuffer.destroy(m_device);
        return false;
    }

    *outId = m_renderSystem->registerMesh(std::move(meshBuf));
    LOG_INFO("AssetManager: uploaded mesh '%s' (verts=%u, tris=%u, meshId=%u)",
             data.name.c_str(),
             meshBuf.vertexCount,
             meshBuf.indexCount / 3,
             *outId);
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
void AssetManager::shutdown(VkDevice device) {
    // Destroy GPU textures
    for (auto& tex : m_textures) {
        if (tex.sampler)    vkDestroySampler(device, tex.sampler, nullptr);
        if (tex.imageView)  vkDestroyImageView(device, tex.imageView, nullptr);
        if (tex.image)      vkDestroyImage(device, tex.image, nullptr);
        if (tex.memory)     vkFreeMemory(device, tex.memory, nullptr);
    }
    m_textures.clear();
    m_meshCache.clear();
    m_textureCache.clear();
    LOG_INFO("AssetManager: shutdown complete");
}

uint32_t AssetManager::loadMesh(const std::string& path) {
    auto it = m_meshCache.find(path);
    if (it != m_meshCache.end()) return it->second;

    MeshData data;
    if (!loadMeshFromAsset(path, data)) {
        LOG_ERROR("AssetManager::loadMesh: failed to load '%s'", path.c_str());
        return INVALID_MESH_ID;
    }

    uint32_t meshId = INVALID_MESH_ID;
    if (uploadMesh(data, &meshId)) {
        m_meshCache[path] = meshId;
    }
    return meshId;
}

bool AssetManager::loadMeshFromAsset(const std::string& path, MeshData& out) {
    // TODO: Implement glTF 2.0 loading via cgltf
    // For now: placeholder OBJ-style parsing
    AAsset* asset = AAssetManager_open(
        m_androidAssets, path.c_str(), AASSET_MODE_BUFFER);
    if (!asset) {
        LOG_ERROR("AssetManager: cannot open '%s'", path.c_str());
        return false;
    }
    // ... parse binary mesh format ...
    AAsset_close(asset);
    out.name = path;
    return false;  // Stub — implement format parser
}

uint32_t AssetManager::createQuadMesh(float width, float height) {
    const std::string key = "quad_" + std::to_string(width)
                          + "_" + std::to_string(height);
    auto it = m_meshCache.find(key);
    if (it != m_meshCache.end()) return it->second;

    MeshData data;
    data.name           = key;
    data.boundingRadius = std::sqrt(width*width + height*height) * 0.5f;

    const float hw = width  * 0.5f;
    const float hh = height * 0.5f;

    // 4 vertices: bottom-left, bottom-right, top-right, top-left
    // Each: pos(3) normal(3) uv(2) tangent(4)
    const float verts[] = {
        -hw, 0, -hh,   0,1,0,   0,0,   1,0,0,1,
         hw, 0, -hh,   0,1,0,   1,0,   1,0,0,1,
         hw, 0,  hh,   0,1,0,   1,1,   1,0,0,1,
        -hw, 0,  hh,   0,1,0,   0,1,   1,0,0,1,
    };
    data.vertices.assign(verts, verts + sizeof(verts)/sizeof(float));
    data.indices = { 0,1,2, 0,2,3 };

    uint32_t meshId = INVALID_MESH_ID;
    if (uploadMesh(data, &meshId)) m_meshCache[key] = meshId;
    return meshId;
}

uint32_t AssetManager::createCapsuleMesh(
    float halfHeight, float radius, int segments)
{
    const std::string key = "capsule_" + std::to_string(halfHeight)
                          + "_r" + std::to_string(radius);
    auto it = m_meshCache.find(key);
    if (it != m_meshCache.end()) return it->second;

    // Capsule = cylinder body + two hemisphere caps
    // Build hemisphere (top/bottom) + cylinder (middle)
    MeshData data;
    data.name           = key;
    data.boundingRadius = halfHeight + radius;

    // Hemisphere generation: iterate from 0 to π/2
    const int rings = segments / 4;
    const int cols  = segments;

    auto addCap = [&](bool top) {
        const float yOffset = top ? halfHeight : -halfHeight;
        const float phiStart = top ? 0.0f : 1.5708f;
        const float phiEnd   = top ? 1.5708f : 3.14159f;

        for (int r = 0; r <= rings; ++r) {
            const float phi = phiStart + (phiEnd - phiStart) * r / rings;
            for (int c = 0; c <= cols; ++c) {
                const float theta = 2.0f * 3.14159f * c / cols;
                const float x = std::sin(phi) * std::cos(theta);
                const float y = std::cos(phi);
                const float z = std::sin(phi) * std::sin(theta);
                data.vertices.insert(data.vertices.end(), {
                    x*radius, y*radius + yOffset, z*radius,
                    x, y, z,
                    static_cast<float>(c)/cols, static_cast<float>(r)/rings,
                    -std::sin(theta), 0, std::cos(theta), 1.0f
                });
            }
        }
    };

    addCap(true);   // Top hemisphere
    addCap(false);  // Bottom hemisphere

    // TODO: Add cylinder body between the two hemispheres
    // (skipped for brevity)

    uint32_t meshId = INVALID_MESH_ID;
    if (!data.vertices.empty()) {
        if (uploadMesh(data, &meshId)) m_meshCache[key] = meshId;
    }
    return meshId;
}

} // namespace hs
