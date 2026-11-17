"""Headless Blender 5.3 generator for 3D Wizard's Chess articulated GLB assets.

Generates:
  - public/models/wizard_white.glb (White Polished Ivory + Imperial Gold + Forged Steel)
  - public/models/wizard_black.glb (Black Volcanic Obsidian + Imperial Gold + Dark Steel)
  - Optional lineup render PNG for visual verification

Coordinate contract for Three.js GLTFLoader (export_yup=True):
  - Blender +Z -> Three.js +Y (up)
  - Blender -Y -> Three.js +Z (piece front/forward)
  - Blender -X -> Three.js -X (piece right / weapon side)
  - Blender +X -> Three.js +X (piece left / shield side)

Each exported root node is named `Piece_<type>` (p, r, n, b, q, k) at origin (0,0,0)
with clean articulated hierarchy:
  Piece_<type>
    Plinth_<type>
    Pivot_Body_<type>
      Mesh_Body_<type>
      Pivot_Head_<type>
        Mesh_Head_<type>
      Pivot_WeaponArm_<type>
        Mesh_WeaponArm_<type>
      Pivot_ShieldArm_<type>   (present on p, n, b, q, k)
        Mesh_ShieldArm_<type>
"""

import math
import os
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "models")
RENDER_PREVIEW_PATH = os.environ.get("WIZARD_CHESS_PREVIEW_PNG", "").strip()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_bsdf_input(bsdf: bpy.types.Node, names, value) -> None:
    if isinstance(names, str):
        names = [names]
    for name in names:
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
            return


# ---------------------------------------------------------------------------
# 2K Procedural PBR Map Synthesis via Vectorized NumPy
# ---------------------------------------------------------------------------

def _value_noise_2d(res: int, grid: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    coarse = rng.random((grid, grid), dtype=np.float32)
    coords = np.linspace(0.0, grid, res, endpoint=False, dtype=np.float32)
    x0 = np.floor(coords).astype(np.int32) % grid
    x1 = (x0 + 1) % grid
    tx = coords - np.floor(coords)
    tx = tx * tx * (3.0 - 2.0 * tx)

    # Bilinear interpolation across rows then cols (periodic tileable)
    c00 = coarse[x0[:, None], x0[None, :]]
    c10 = coarse[x0[:, None], x1[None, :]]
    c01 = coarse[x1[:, None], x0[None, :]]
    c11 = coarse[x1[:, None], x1[None, :]]

    row0 = c00 * (1.0 - tx[None, :]) + c10 * tx[None, :]
    row1 = c01 * (1.0 - tx[None, :]) + c11 * tx[None, :]
    return row0 * (1.0 - tx[:, None]) + row1 * tx[:, None]


def _fbm_2d(res: int, octaves, seed: int) -> np.ndarray:
    acc = np.zeros((res, res), dtype=np.float32)
    amp_sum = 0.0
    for idx, (grid, amp) in enumerate(octaves):
        acc += _value_noise_2d(res, grid, seed + idx * 101) * amp
        amp_sum += amp
    return acc / max(amp_sum, 1e-6)


def _height_to_normal_rgba(height: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nx = -dx
    ny = -dy
    nz = np.ones_like(height)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-8)
    rgba = np.empty((height.shape[0], height.shape[1], 4), dtype=np.float32)
    rgba[..., 0] = np.clip(nx * inv_len * 0.5 + 0.5, 0.0, 1.0)
    rgba[..., 1] = np.clip(ny * inv_len * 0.5 + 0.5, 0.0, 1.0)
    rgba[..., 2] = np.clip(nz * inv_len * 0.5 + 0.5, 0.0, 1.0)
    rgba[..., 3] = 1.0
    return rgba


def _make_blender_image(name: str, rgba: np.ndarray, colorspace: str) -> bpy.types.Image:
    h, w, _ = rgba.shape
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    img.pack()
    return img


def generate_stone_textures(variant: str, res: int = 2048):
    """Generates 2048x2048 tileable Ivory Marble or Volcanic Obsidian PBR maps."""
    is_white = variant == "w"
    seed = 20261 if is_white else 80809

    base_fbm = _fbm_2d(res, [(8, 0.5), (16, 0.3), (32, 0.15), (64, 0.05)], seed)
    fine_grain = _fbm_2d(res, [(64, 0.5), (128, 0.35), (256, 0.15)], seed + 77)

    u = np.linspace(0.0, 2.0 * math.pi, res, endpoint=False, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(u, u)

    # Organic marble/obsidian veins via domain-warped sine ridges
    warp = (base_fbm - 0.5) * 4.8
    vein_wave = np.abs(np.sin(grid_x * 2.0 + grid_y * 1.0 + warp))
    veins = np.power(np.clip(1.0 - vein_wave, 0.0, 1.0), 10.0)
    micro_cracks = np.power(np.clip(1.0 - np.abs(np.sin(grid_x * 5.0 - grid_y * 3.0 + warp * 1.5)), 0.0, 1.0), 18.0)

    albedo = np.ones((res, res, 4), dtype=np.float32)
    if is_white:
        # Warm Carrara Ivory with soft taupe-gold marble veining
        r = 0.935 - base_fbm * 0.065 - veins * 0.13 - micro_cracks * 0.08
        g = 0.902 - base_fbm * 0.072 - veins * 0.15 - micro_cracks * 0.10
        b = 0.848 - base_fbm * 0.082 - veins * 0.18 - micro_cracks * 0.12
        rough = 0.21 + fine_grain * 0.07 + veins * 0.06
        height = fine_grain * 0.35 - veins * 0.35 - micro_cracks * 0.3
    else:
        # Deep Glossy Volcanic Obsidian with subtle quartz/gold-flecked fractures
        r = 0.055 + base_fbm * 0.032 + veins * 0.095 + micro_cracks * 0.16
        g = 0.060 + base_fbm * 0.034 + veins * 0.088 + micro_cracks * 0.13
        b = 0.082 + base_fbm * 0.042 + veins * 0.072 + micro_cracks * 0.08
        rough = 0.17 + fine_grain * 0.06 + veins * 0.09
        height = fine_grain * 0.30 - veins * 0.45 - micro_cracks * 0.40

    albedo[..., 0] = np.clip(r, 0.0, 1.0)
    albedo[..., 1] = np.clip(g, 0.0, 1.0)
    albedo[..., 2] = np.clip(b, 0.0, 1.0)

    rough_rgba = np.ones((res, res, 4), dtype=np.float32)
    rough_clamped = np.clip(rough, 0.12, 0.45)
    rough_rgba[..., 0] = rough_clamped
    rough_rgba[..., 1] = rough_clamped
    rough_rgba[..., 2] = rough_clamped

    normal_rgba = _height_to_normal_rgba(height, strength=1.45)

    tag = "Ivory2K" if is_white else "Obsidian2K"
    return (
        _make_blender_image(f"{tag}_Albedo", albedo, "sRGB"),
        _make_blender_image(f"{tag}_Roughness", rough_rgba, "Non-Color"),
        _make_blender_image(f"{tag}_Normal", normal_rgba, "Non-Color"),
    )


def generate_brushed_metal_textures(tag: str, base_rgb, base_rough: float, seed: int, res: int = 1024):
    """Generates 1024x1024 anisotropic brushed metallic Albedo/Roughness/Normal textures."""
    rng = np.random.default_rng(seed)
    row_streaks = rng.random((res, 1), dtype=np.float32) * np.ones((1, res), dtype=np.float32)
    fine = _fbm_2d(res, [(32, 0.4), (96, 0.6)], seed + 13)
    patina = _fbm_2d(res, [(8, 0.6), (16, 0.4)], seed + 29)
    combined = row_streaks * 0.55 + fine * 0.45

    albedo = np.ones((res, res, 4), dtype=np.float32)
    for c in range(3):
        albedo[..., c] = np.clip(base_rgb[c] * (0.93 + combined * 0.10 - patina * 0.06), 0.0, 1.0)

    rough_rgba = np.ones((res, res, 4), dtype=np.float32)
    rough_val = np.clip(base_rough + (combined - 0.5) * 0.08 + patina * 0.04, 0.10, 0.48)
    rough_rgba[..., 0] = rough_val
    rough_rgba[..., 1] = rough_val
    rough_rgba[..., 2] = rough_val

    normal_rgba = _height_to_normal_rgba(combined * 0.4 + patina * 0.15, strength=0.9)

    return (
        _make_blender_image(f"{tag}_Albedo", albedo, "sRGB"),
        _make_blender_image(f"{tag}_Roughness", rough_rgba, "Non-Color"),
        _make_blender_image(f"{tag}_Normal", normal_rgba, "Non-Color"),
    )


def create_pbr_material(
    name: str,
    albedo_img=None,
    rough_img=None,
    normal_img=None,
    base_color=(0.8, 0.8, 0.8, 1.0),
    metallic=0.0,
    roughness=0.35,
    coat_weight=0.0,
    coat_roughness=0.15,
    normal_strength=0.32,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links

    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    set_bsdf_input(bsdf, "Base Color", base_color)
    set_bsdf_input(bsdf, "Metallic", metallic)
    set_bsdf_input(bsdf, "Roughness", roughness)
    set_bsdf_input(bsdf, ["Coat Weight", "Clearcoat"], coat_weight)
    set_bsdf_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], coat_roughness)

    tex_coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.6, 1.6, 1.6)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    if albedo_img is not None:
        tex_a = nodes.new("ShaderNodeTexImage")
        tex_a.image = albedo_img
        links.new(mapping.outputs["Vector"], tex_a.inputs["Vector"])
        links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_img is not None:
        tex_r = nodes.new("ShaderNodeTexImage")
        tex_r.image = rough_img
        links.new(mapping.outputs["Vector"], tex_r.inputs["Vector"])
        links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])

    if normal_img is not None:
        tex_n = nodes.new("ShaderNodeTexImage")
        tex_n.image = normal_img
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        links.new(mapping.outputs["Vector"], tex_n.inputs["Vector"])
        links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def build_palette(variant: str):
    """Creates full PBR material palette for either White ('w') or Black ('b')."""
    p_alb, p_rgh, p_nrm = generate_stone_textures(variant, res=2048)
    g_alb, g_rgh, g_nrm = generate_brushed_metal_textures(
        f"Gold_{variant}", (0.835, 0.675, 0.215), 0.22, seed=4101 if variant == "w" else 4202
    )
    steel_rgb = (0.80, 0.84, 0.89) if variant == "w" else (0.64, 0.69, 0.76)
    s_alb, s_rgh, s_nrm = generate_brushed_metal_textures(
        f"Steel_{variant}", steel_rgb, 0.18, seed=5101 if variant == "w" else 5202
    )

    is_w = variant == "w"
    primary = create_pbr_material(
        f"Mat_Primary_{variant}",
        albedo_img=p_alb,
        rough_img=p_rgh,
        normal_img=p_nrm,
        metallic=0.04 if is_w else 0.14,
        coat_weight=0.36 if is_w else 0.45,
        coat_roughness=0.14,
        normal_strength=0.28,
    )
    secondary = create_pbr_material(
        f"Mat_Secondary_{variant}",
        rough_img=p_rgh,
        normal_img=p_nrm,
        base_color=(0.82, 0.77, 0.70, 1.0) if is_w else (0.11, 0.125, 0.175, 1.0),
        metallic=0.06 if is_w else 0.22,
        coat_weight=0.18,
        normal_strength=0.22,
    )
    gold = create_pbr_material(
        f"Mat_Gold_{variant}",
        albedo_img=g_alb,
        rough_img=g_rgh,
        normal_img=g_nrm,
        metallic=0.92,
        normal_strength=0.20,
    )
    steel = create_pbr_material(
        f"Mat_Steel_{variant}",
        albedo_img=s_alb,
        rough_img=s_rgh,
        normal_img=s_nrm,
        metallic=0.94,
        normal_strength=0.18,
    )
    recess = create_pbr_material(
        f"Mat_Recess_{variant}",
        base_color=(0.025, 0.028, 0.038, 1.0),
        metallic=0.12,
        roughness=0.78,
    )
    leather = create_pbr_material(
        f"Mat_Leather_{variant}",
        base_color=(0.24, 0.16, 0.11, 1.0) if is_w else (0.12, 0.09, 0.075, 1.0),
        metallic=0.04,
        roughness=0.56,
    )
    parchment = create_pbr_material(
        f"Mat_Parchment_{variant}",
        base_color=(0.91, 0.85, 0.72, 1.0),
        metallic=0.02,
        roughness=0.68,
    )

    return {
        "primary": primary,
        "secondary": secondary,
        "gold": gold,
        "steel": steel,
        "recess": recess,
        "leather": leather,
        "parchment": parchment,
    }


# ---------------------------------------------------------------------------
# BMesh Sculptural Geometry Helpers (Blender Z-up, -Y forward)
# ---------------------------------------------------------------------------

def _new_obj(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material, parent=None) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def _assign_box_uvs(bm: bmesh.types.BMesh, scale: float = 1.4) -> None:
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x * scale, co.y * scale
            elif ax >= ay and ax >= az:
                u, v = co.y * scale, co.z * scale
            else:
                u, v = co.x * scale, co.z * scale
            loop[uv_layer].uv = (u + 0.5, v + 0.5)


def add_lathe_obj(
    name: str,
    profile_rz,
    segments: int,
    mat: bpy.types.Material,
    flute_amp: float = 0.0,
    flute_count: int = 0,
    scale_xyz=(1.0, 1.0, 1.0),
    bevel_width: float = 0.0,
    subsurf_levels: int = 0,
    rot_z: float = 0.0,
    loc=(0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Revolves a (radius, z) profile around Blender +Z axis with optional sculptural fluting."""
    bm = bmesh.new()
    rings = []
    for r_base, z in profile_rz:
        if r_base <= 1e-5:
            v = bm.verts.new((0.0, 0.0, z))
            rings.append([v])
        else:
            ring = []
            for i in range(segments):
                ang = (2.0 * math.pi * i) / segments
                flute = 0.0
                if flute_amp > 0.0 and flute_count > 0:
                    flute = flute_amp * math.cos(flute_count * ang)
                r = max(1e-4, r_base + flute)
                x = math.cos(ang) * r * scale_xyz[0]
                y = math.sin(ang) * r * scale_xyz[1]
                ring.append(bm.verts.new((x, y, z * scale_xyz[2])))
            rings.append(ring)

    for idx in range(len(rings) - 1):
        a, b = rings[idx], rings[idx + 1]
        if len(a) == 1 and len(b) > 1:
            c = a[0]
            for i in range(segments):
                bm.faces.new((c, b[i], b[(i + 1) % segments]))
        elif len(a) > 1 and len(b) == 1:
            c = b[0]
            for i in range(segments):
                bm.faces.new((a[i], c, a[(i + 1) % segments]))
        elif len(a) > 1 and len(b) > 1:
            for i in range(segments):
                j = (i + 1) % segments
                bm.faces.new((a[i], b[i], b[j], a[j]))

    obj = _new_obj(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = (0.0, 0.0, rot_z)

    if bevel_width > 0.0:
        bev = obj.modifiers.new("Bevel", "BEVEL")
        bev.width = bevel_width
        bev.segments = 2
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(32.0)
    if subsurf_levels > 0:
        sub = obj.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = subsurf_levels
        sub.render_levels = subsurf_levels

    es = obj.modifiers.new("EdgeSplit", "EDGE_SPLIT")
    es.split_angle = math.radians(42.0)
    return obj


def add_primitive_obj(
    name: str,
    kind: str,
    mat: bpy.types.Material,
    loc=(0.0, 0.0, 0.0),
    rot=(0.0, 0.0, 0.0),
    scale=(1.0, 1.0, 1.0),
    size=(1.0, 1.0, 1.0),
    radius: float = 0.1,
    r_top: float = 0.1,
    r_bot: float = 0.1,
    height: float = 0.2,
    segs: int = 16,
    bevel_width: float = 0.0,
    subsurf_levels: int = 0,
    edge_split: bool = True,
) -> bpy.types.Object:
    bm = bmesh.new()
    if kind == "box":
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    elif kind == "cyl":
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=r_bot,
            radius2=r_top,
            depth=height,
        )
    elif kind == "cone":
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=True,
            segments=segs,
            radius1=r_bot,
            radius2=0.001,
            depth=height,
        )
    elif kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(8, segs // 2), radius=radius)
    elif kind == "octa":
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
    elif kind == "torus":
        # r_bot = major radius, r_top = minor tube radius
        major = r_bot
        minor = r_top
        u_seg = max(16, segs)
        v_seg = 10
        rings = []
        for i in range(u_seg):
            u = (2.0 * math.pi * i) / u_seg
            cu, su = math.cos(u), math.sin(u)
            ring = []
            for j in range(v_seg):
                v = (2.0 * math.pi * j) / v_seg
                cv, sv = math.cos(v), math.sin(v)
                r = major + minor * cv
                ring.append(bm.verts.new((cu * r, su * r, minor * sv)))
            rings.append(ring)
        for i in range(u_seg):
            ni = (i + 1) % u_seg
            for j in range(v_seg):
                nj = (j + 1) % v_seg
                bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))

    obj = _new_obj(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = scale

    if bevel_width > 0.0:
        bev = obj.modifiers.new("Bevel", "BEVEL")
        bev.width = bevel_width
        bev.segments = 2
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(30.0)
    if subsurf_levels > 0:
        sub = obj.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = subsurf_levels
        sub.render_levels = subsurf_levels
    if edge_split:
        es = obj.modifiers.new("EdgeSplit", "EDGE_SPLIT")
        es.split_angle = math.radians(42.0)
    return obj


def add_tube_obj(
    name: str,
    points,
    radius: float,
    mat: bpy.types.Material,
    resolution: int = 12,
    bevel_res: int = 6,
    taper_end: bool = False,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = resolution
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = bevel_res
    curve_data.use_fill_caps = True

    spline = curve_data.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for i, pt in enumerate(points):
        spline.points[i].co = (pt[0], pt[1], pt[2], 1.0)
        if taper_end:
            spline.points[i].radius = 1.0 - 0.55 * (i / max(1, len(points) - 1))
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(points))

    curve_obj = bpy.data.objects.new(f"{name}_TmpCurve", curve_data)
    bpy.context.scene.collection.objects.link(curve_obj)

    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = curve_obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(eval_obj)
    mesh.name = name
    mesh.materials.append(mat)
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))

    bpy.data.objects.remove(curve_obj, do_unlink=True)
    bpy.data.curves.remove(curve_data)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def add_extruded_poly_obj(
    name: str,
    xy_points,
    depth: float,
    mat: bpy.types.Material,
    bevel_width: float = 0.015,
    subsurf_levels: int = 0,
    loc=(0.0, 0.0, 0.0),
    rot=(0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Extrudes a 2D polygon symmetrically along local Z in [-depth/2, +depth/2]."""
    bm = bmesh.new()
    front = [bm.verts.new((p[0], p[1], depth * 0.5)) for p in xy_points]
    back = [bm.verts.new((p[0], p[1], -depth * 0.5)) for p in xy_points]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(xy_points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((back[i], back[j], front[j], front[i]))

    obj = _new_obj(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = rot

    if bevel_width > 0.0:
        bev = obj.modifiers.new("Bevel", "BEVEL")
        bev.width = bevel_width
        bev.segments = 2
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(28.0)
    if subsurf_levels > 0:
        sub = obj.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = subsurf_levels
        sub.render_levels = subsurf_levels
    es = obj.modifiers.new("EdgeSplit", "EDGE_SPLIT")
    es.split_angle = math.radians(42.0)
    return obj


def add_diamond_blade_obj(
    name: str,
    length: float,
    base_half_w: float,
    shoulder_half_w: float,
    ridge: float,
    mat: bpy.types.Material,
    loc=(0.0, 0.0, 0.0),
    rot=(0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Diamond-section medieval blade pointing along +Z from z=0 to z=length."""
    bm = bmesh.new()
    sy = length * 0.82
    sr = ridge * 0.74
    # Front is -Y in Blender
    L0 = bm.verts.new((-base_half_w, 0.0, 0.0))
    R0 = bm.verts.new((base_half_w, 0.0, 0.0))
    F0 = bm.verts.new((0.0, -ridge, 0.0))
    B0 = bm.verts.new((0.0, ridge, 0.0))

    L1 = bm.verts.new((-shoulder_half_w, 0.0, sy))
    R1 = bm.verts.new((shoulder_half_w, 0.0, sy))
    F1 = bm.verts.new((0.0, -sr, sy))
    B1 = bm.verts.new((0.0, sr, sy))

    T = bm.verts.new((0.0, 0.0, length))

    for tri in (
        (F0, R0, R1), (F0, R1, F1),
        (L0, F0, F1), (L0, F1, L1),
        (R0, B0, B1), (R0, B1, R1),
        (B0, L0, L1), (B0, L1, B1),
        (F1, R1, T), (L1, F1, T), (R1, B1, T), (B1, L1, T),
        (L0, R0, F0), (R0, L0, B0),
    ):
        bm.faces.new(tri)

    obj = _new_obj(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def bake_parts_into_joint_mesh(name: str, part_objs, pivot_world: Vector, parent_obj: bpy.types.Object) -> bpy.types.Object:
    """Evaluates modifiers on a list of sculpted parts, assigns box UVs, merges them
    into a single multi-material mesh with origin exactly at `pivot_world`, and parents it."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    inv_pivot = Matrix.Translation(-pivot_world)

    merged_bm = bmesh.new()
    mat_list = []
    mat_index_by_name = {}

    for obj in part_objs:
        eval_obj = obj.evaluated_get(depsgraph)
        temp_mesh = bpy.data.meshes.new_from_object(eval_obj)
        temp_mesh.transform(inv_pivot @ obj.matrix_world)

        slot_map = {}
        for idx, mat in enumerate(temp_mesh.materials):
            if mat is None:
                continue
            if mat.name not in mat_index_by_name:
                mat_index_by_name[mat.name] = len(mat_list)
                mat_list.append(mat)
            slot_map[idx] = mat_index_by_name[mat.name]

        part_bm = bmesh.new()
        part_bm.from_mesh(temp_mesh)
        for f in part_bm.faces:
            f.material_index = slot_map.get(f.material_index, 0)
            f.smooth = True

        # Transfer part_bm into merged_bm via temporary mesh
        part_bm.to_mesh(temp_mesh)
        part_bm.free()
        merged_bm.from_mesh(temp_mesh)
        bpy.data.meshes.remove(temp_mesh)

        bpy.data.objects.remove(obj, do_unlink=True)

    _assign_box_uvs(merged_bm, scale=1.35)
    bmesh.ops.recalc_face_normals(merged_bm, faces=merged_bm.faces)

    out_mesh = bpy.data.meshes.new(name)
    merged_bm.to_mesh(out_mesh)
    merged_bm.free()
    for m in mat_list:
        out_mesh.materials.append(m)

    out_obj = bpy.data.objects.new(name, out_mesh)
    bpy.context.scene.collection.objects.link(out_obj)
    out_obj.parent = parent_obj
    out_obj.location = (0.0, 0.0, 0.0)
    return out_obj


def make_empty(name: str, loc=(0.0, 0.0, 0.0), parent=None) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 0.08
    bpy.context.scene.collection.objects.link(empty)
    if parent is not None:
        empty.parent = parent
    empty.location = loc
    return empty


# ---------------------------------------------------------------------------
# Shared Sub-Sculpt Builders (Blender Coords: +Z up, -Y front, -X right, +X left)
# ---------------------------------------------------------------------------

def build_plinth_parts(radius: float, height: float, pal, octagonal: bool = False):
    segs = 8 if octagonal else 32
    rot_z = math.pi / 8.0 if octagonal else 0.0
    pts = [
        (0.0, 0.0),
        (radius, 0.0),
        (radius, height * 0.22),
        (radius * 0.94, height * 0.33),
        (radius * 0.91, height * 0.48),
        (radius * 0.81, height * 0.72),
        (radius * 0.85, height * 0.86),
        (radius * 0.78, height),
        (0.0, height),
    ]
    parts = [
        add_lathe_obj(
            "plinth_core",
            pts,
            segs,
            pal["primary"],
            bevel_width=0.008 if octagonal else 0.0,
            rot_z=rot_z,
        ),
        add_primitive_obj(
            "plinth_ring_lo",
            "torus",
            pal["gold"],
            loc=(0.0, 0.0, height * 0.39),
            rot=(0.0, 0.0, rot_z),
            r_bot=radius * 0.925,
            r_top=0.013,
            segs=segs,
        ),
        add_primitive_obj(
            "plinth_ring_hi",
            "torus",
            pal["gold"],
            loc=(0.0, 0.0, height * 0.91),
            rot=(0.0, 0.0, rot_z),
            r_bot=radius * 0.835,
            r_top=0.013,
            segs=segs,
        ),
    ]
    return parts


def build_armored_arm_parts(side: str, shoulder_pivot: Vector, hand_local: Vector, scale: float, pal):
    """Builds multi-lame pauldron, vambrace, couter, and gauntlet relative to shoulder_pivot."""
    s = 1.0 if side == "right" else -1.0
    # In Blender: right side is -X, left side is +X
    x_sign = -1.0 if side == "right" else 1.0
    parts = []

    # Sculpted curved shoulder pauldron shell + gold rim
    p_pos = shoulder_pivot + Vector((x_sign * 0.01 * scale, 0.0, 0.015 * scale))
    parts.append(
        add_primitive_obj(
            "pauldron",
            "sphere",
            pal["primary"],
            loc=p_pos,
            scale=(0.86, 1.05, 0.78),
            radius=0.088 * scale,
            segs=16,
            bevel_width=0.0,
        )
    )
    parts.append(
        add_primitive_obj(
            "pauldron_rim",
            "torus",
            pal["gold"],
            loc=p_pos + Vector((0.0, 0.0, -0.025 * scale)),
            rot=(0.0, x_sign * -0.25, 0.0),
            r_bot=0.082 * scale,
            r_top=0.012 * scale,
            segs=18,
        )
    )

    elbow = shoulder_pivot + Vector((x_sign * 0.025 * scale, -0.065 * scale, -0.125 * scale))
    hand_world = shoulder_pivot + hand_local

    def add_limb(a: Vector, b: Vector, r1: float, r2: float, mat):
        vec = b - a
        ln = vec.length
        if ln < 1e-4:
            return
        mid = (a + b) * 0.5
        quat = vec.normalized().to_track_quat("Z", "Y")
        parts.append(
            add_primitive_obj(
                "limb",
                "cyl",
                mat,
                loc=mid,
                rot=quat.to_euler(),
                r_bot=r1,
                r_top=r2,
                height=ln,
                segs=12,
                bevel_width=0.004,
            )
        )

    add_limb(shoulder_pivot, elbow, 0.044 * scale, 0.036 * scale, pal["secondary"])
    parts.append(
        add_primitive_obj(
            "couter",
            "sphere",
            pal["gold"],
            loc=elbow,
            radius=0.044 * scale,
            segs=12,
        )
    )
    add_limb(elbow, hand_world, 0.038 * scale, 0.032 * scale, pal["primary"])
    parts.append(
        add_primitive_obj(
            "gauntlet",
            "box",
            pal["gold"],
            loc=hand_world,
            size=(0.068 * scale, 0.078 * scale, 0.074 * scale),
            bevel_width=0.009 * scale,
        )
    )
    return parts


def build_sword_parts(grip_world: Vector, blade_len: float, blade_w: float, guard_w: float, grip_len: float, point_down: bool, pal, tilt_x: float = 0.0):
    """Builds broadsword/greatsword with leather grip, octagonal gold pommel, crossguard & diamond blade."""
    d = -1.0 if point_down else 1.0
    parts = []

    rot_mat = Matrix.Rotation(tilt_x, 4, "X")

    def place_pt(local_z: float) -> Vector:
        v = rot_mat @ Vector((0.0, 0.0, local_z))
        return grip_world + v

    euler_tilt = (tilt_x, 0.0, 0.0)

    parts.append(
        add_primitive_obj(
            "grip",
            "cyl",
            pal["leather"],
            loc=place_pt(d * grip_len * 0.15),
            rot=euler_tilt,
            r_bot=0.019,
            r_top=0.017,
            height=grip_len,
            segs=12,
        )
    )
    parts.append(
        add_primitive_obj(
            "pommel",
            "octa",
            pal["gold"],
            loc=place_pt(-d * grip_len * 0.45),
            rot=euler_tilt,
            radius=0.033,
        )
    )
    guard_z = d * grip_len * 0.56
    parts.append(
        add_primitive_obj(
            "guard",
            "box",
            pal["gold"],
            loc=place_pt(guard_z),
            rot=euler_tilt,
            size=(guard_w, 0.038, 0.028),
            bevel_width=0.005,
        )
    )
    for sx in (-1.0, 1.0):
        fin_offset = rot_mat @ Vector((sx * guard_w * 0.5, 0.0, guard_z))
        parts.append(
            add_primitive_obj(
                "guard_finial",
                "sphere",
                pal["gold"],
                loc=grip_world + fin_offset,
                radius=0.021,
                segs=10,
            )
        )

    blade_rot = (tilt_x + (math.pi if point_down else 0.0), 0.0, 0.0)
    parts.append(
        add_diamond_blade_obj(
            "blade",
            length=blade_len,
            base_half_w=blade_w * 0.5,
            shoulder_half_w=blade_w * 0.34,
            ridge=blade_w * 0.25,
            mat=pal["steel"],
            loc=place_pt(guard_z + d * 0.012),
            rot=blade_rot,
        )
    )
    return parts


def build_heater_shield_parts(center_world: Vector, rot_euler, width: float, height: float, pal):
    """Builds curved beveled Heater Shield with gold border and raised gold Latin cross on front (-Y)."""
    hw, hh = width * 0.5, height * 0.5
    pts = [
        (-hw, hh),
        (hw, hh),
        (hw, hh * 0.12),
        (hw * 0.65, -hh * 0.48),
        (0.0, -hh),
        (-hw * 0.65, -hh * 0.48),
        (-hw, hh * 0.12),
    ]
    # Extrude in XY -> rotates X by pi/2 so shape sits upright in XZ plane and front faces -Y
    base_rot = Euler(rot_euler, "YXZ").to_matrix().to_4x4()
    stand_mat = base_rot @ Matrix.Rotation(math.pi * 0.5, 4, "X")
    stand_euler = stand_mat.to_euler()

    parts = [
        add_extruded_poly_obj(
            "shield_plate",
            pts,
            depth=0.028,
            mat=pal["primary"],
            bevel_width=0.008,
            loc=center_world,
            rot=stand_euler,
        )
    ]
    # Gold border rim slightly behind front face
    rim_pts = [(p[0] * 1.10, p[1] * 1.07) for p in pts]
    rim_offset = base_rot @ Vector((0.0, 0.004, 0.0))
    parts.append(
        add_extruded_poly_obj(
            "shield_rim",
            rim_pts,
            depth=0.022,
            mat=pal["gold"],
            bevel_width=0.006,
            loc=center_world + rim_offset,
            rot=stand_euler,
        )
    )
    # Raised gold cross on front (-Y in local shield frame)
    front_v = base_rot @ Vector((0.0, -0.024, -height * 0.02))
    front_h = base_rot @ Vector((0.0, -0.024, height * 0.12))
    front_b = base_rot @ Vector((0.0, -0.028, height * 0.12))
    front_euler = base_rot.to_euler()
    parts.append(
        add_primitive_obj(
            "shield_cross_v",
            "box",
            pal["gold"],
            loc=center_world + front_v,
            rot=front_euler,
            size=(width * 0.16, 0.016, height * 0.76),
            bevel_width=0.003,
        )
    )
    parts.append(
        add_primitive_obj(
            "shield_cross_h",
            "box",
            pal["gold"],
            loc=center_world + front_h,
            rot=front_euler,
            size=(width * 0.68, 0.016, width * 0.16),
            bevel_width=0.003,
        )
    )
    parts.append(
        add_primitive_obj(
            "shield_boss",
            "sphere",
            pal["gold"],
            loc=center_world + front_b,
            rot=front_euler,
            scale=(1.0, 0.55, 1.0),
            radius=width * 0.11,
            segs=12,
        )
    )
    return parts


def build_latin_cross_parts(base_world: Vector, height: float, width: float, thick: float, pal, tilt_x: float = 0.0):
    rot_m = Matrix.Rotation(tilt_x, 4, "X")
    v_off = rot_m @ Vector((0.0, 0.0, height * 0.5))
    h_off = rot_m @ Vector((0.0, 0.0, height * 0.68))
    return [
        add_primitive_obj(
            "cross_v",
            "box",
            pal["gold"],
            loc=base_world + v_off,
            rot=(tilt_x, 0.0, 0.0),
            size=(thick, thick, height),
            bevel_width=thick * 0.14,
        ),
        add_primitive_obj(
            "cross_h",
            "box",
            pal["gold"],
            loc=base_world + h_off,
            rot=(tilt_x, 0.0, 0.0),
            size=(width, thick, thick),
            bevel_width=thick * 0.14,
        ),
    ]


# ---------------------------------------------------------------------------
# 6 Distinct Armored Medieval Chess Piece Archetypes
# ---------------------------------------------------------------------------

def build_pawn(pal) -> bpy.types.Object:
    root = make_empty("Piece_p")
    plinth_parts = build_plinth_parts(0.31, 0.13, pal)
    bake_parts_into_joint_mesh("Plinth_p", plinth_parts, Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.12))
    pivot_body = make_empty("Pivot_Body_p", body_pivot_w, root)

    body_parts = [
        add_lathe_obj(
            "p_skirt",
            [(0.0, 0.12), (0.245, 0.12), (0.225, 0.24), (0.175, 0.37), (0.0, 0.37)],
            24,
            pal["secondary"],
            flute_amp=0.008,
            flute_count=8,
            subsurf_levels=1,
        ),
        add_primitive_obj(
            "p_belt",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 0.37),
            r_bot=0.186,
            r_top=0.180,
            height=0.048,
            segs=24,
            bevel_width=0.006,
        ),
        add_primitive_obj(
            "p_buckle",
            "box",
            pal["gold"],
            loc=(0.0, -0.182, 0.37),
            size=(0.072, 0.032, 0.062),
            bevel_width=0.006,
        ),
        add_lathe_obj(
            "p_cuirass",
            [
                (0.0, 0.37),
                (0.168, 0.38),
                (0.208, 0.53),
                (0.188, 0.63),
                (0.118, 0.66),
                (0.0, 0.66),
            ],
            24,
            pal["primary"],
            scale_xyz=(1.06, 0.88, 1.0),
            subsurf_levels=1,
        ),
        add_primitive_obj(
            "p_sternum",
            "box",
            pal["gold"],
            loc=(0.0, -0.184, 0.51),
            rot=(-0.14, 0.0, 0.0),
            size=(0.038, 0.032, 0.22),
            bevel_width=0.006,
        ),
        add_primitive_obj(
            "p_gorget",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 0.65),
            r_bot=0.140,
            r_top=0.120,
            height=0.056,
            segs=20,
            bevel_width=0.006,
        ),
    ]
    for i in range(4):
        ang = (i * math.pi) / 2.0 + math.pi / 4.0
        tx = math.sin(ang) * 0.175
        ty = -math.cos(ang) * 0.175
        body_parts.append(
            add_primitive_obj(
                f"p_tasset_{i}",
                "box",
                pal["primary"],
                loc=(tx, ty, 0.27),
                rot=(0.22, 0.0, ang),
                size=(0.142, 0.042, 0.172),
                bevel_width=0.008,
            )
        )
    bake_parts_into_joint_mesh("Mesh_Body_p", body_parts, body_pivot_w, pivot_body)

    # Head + Chapel-de-Fer Kettle Hat
    head_pivot_w = Vector((0.0, 0.0, 0.65))
    pivot_head = make_empty("Pivot_Head_p", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = [
        add_primitive_obj("p_head_core", "sphere", pal["secondary"], loc=(0.0, 0.0, 0.76), radius=0.106, segs=18),
        add_primitive_obj(
            "p_visor",
            "box",
            pal["recess"],
            loc=(0.0, -0.090, 0.775),
            size=(0.122, 0.050, 0.038),
            bevel_width=0.004,
        ),
        add_primitive_obj(
            "p_chin",
            "cyl",
            pal["primary"],
            loc=(0.0, 0.0, 0.715),
            r_bot=0.110,
            r_top=0.096,
            height=0.082,
            segs=16,
            bevel_width=0.006,
        ),
        add_lathe_obj(
            "p_kettle_helm",
            [
                (0.232, 0.79),
                (0.210, 0.818),
                (0.148, 0.858),
                (0.130, 0.935),
                (0.085, 1.005),
                (0.020, 1.040),
                (0.0, 1.045),
            ],
            28,
            pal["primary"],
            subsurf_levels=1,
        ),
        add_primitive_obj(
            "p_kettle_rim",
            "torus",
            pal["gold"],
            loc=(0.0, 0.0, 0.798),
            r_bot=0.222,
            r_top=0.013,
            segs=28,
        ),
        add_tube_obj(
            "p_kettle_crest",
            [(0.0, -0.138, 0.915), (0.0, -0.09, 1.015), (0.0, 0.0, 1.052), (0.0, 0.09, 1.015), (0.0, 0.138, 0.915)],
            0.015,
            pal["gold"],
        ),
        add_primitive_obj(
            "p_finial",
            "cone",
            pal["gold"],
            loc=(0.0, 0.0, 1.055),
            r_bot=0.026,
            height=0.054,
            segs=10,
        ),
    ]
    bake_parts_into_joint_mesh("Mesh_Head_p", head_parts, head_pivot_w, pivot_head)

    # Left ShieldArm (+X)
    shield_pivot_w = Vector((0.205, -0.01, 0.59))
    pivot_shield = make_empty("Pivot_ShieldArm_p", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.03, -0.17, -0.11))
    shield_parts = build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 0.94, pal)
    shield_parts += build_heater_shield_parts(
        shield_pivot_w + shield_hand_local + Vector((0.035, -0.035, 0.02)),
        (0.08, 0.0, 0.45),
        0.24,
        0.31,
        pal,
    )
    bake_parts_into_joint_mesh("Mesh_ShieldArm_p", shield_parts, shield_pivot_w, pivot_shield)

    # Right WeaponArm (-X)
    weapon_pivot_w = Vector((-0.205, -0.01, 0.59))
    pivot_weapon = make_empty("Pivot_WeaponArm_p", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.02, -0.18, -0.10))
    weapon_parts = build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 0.94, pal)
    weapon_parts += build_sword_parts(
        weapon_pivot_w + weapon_hand_local,
        0.46,
        0.058,
        0.165,
        0.11,
        point_down=False,
        pal=pal,
        tilt_x=0.12,
    )
    bake_parts_into_joint_mesh("Mesh_WeaponArm_p", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_rook(pal) -> bpy.types.Object:
    root = make_empty("Piece_r")
    plinth_parts = build_plinth_parts(0.36, 0.15, pal, octagonal=True)
    bake_parts_into_joint_mesh("Plinth_r", plinth_parts, Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.14))
    pivot_body = make_empty("Pivot_Body_r", body_pivot_w, root)
    body_parts = [
        add_lathe_obj(
            "r_shaft",
            [(0.0, 0.14), (0.305, 0.14), (0.282, 0.30), (0.248, 0.56), (0.258, 0.81), (0.0, 0.81)],
            8,
            pal["primary"],
            bevel_width=0.012,
            rot_z=math.pi / 8.0,
        ),
        add_primitive_obj(
            "r_belt",
            "cyl",
            pal["secondary"],
            loc=(0.0, 0.0, 0.39),
            rot=(0.0, 0.0, math.pi / 8.0),
            r_bot=0.288,
            r_top=0.280,
            height=0.048,
            segs=8,
            bevel_width=0.008,
        ),
        add_primitive_obj(
            "r_neck_gold",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 0.79),
            rot=(0.0, 0.0, math.pi / 8.0),
            r_bot=0.266,
            r_top=0.272,
            height=0.042,
            segs=8,
            bevel_width=0.006,
        ),
        # Front (-Y) fortified gatehouse with portcullis bars
        add_primitive_obj(
            "r_gate_recess",
            "box",
            pal["recess"],
            loc=(0.0, -0.266, 0.25),
            size=(0.145, 0.040, 0.225),
        ),
        add_primitive_obj(
            "r_gate_arch",
            "box",
            pal["gold"],
            loc=(0.0, -0.268, 0.368),
            size=(0.175, 0.046, 0.034),
            bevel_width=0.005,
        ),
    ]
    for bx in (-0.042, 0.0, 0.042):
        body_parts.append(
            add_primitive_obj(
                "r_gate_bar",
                "cyl",
                pal["gold"],
                loc=(bx, -0.276, 0.25),
                r_bot=0.009,
                r_top=0.009,
                height=0.205,
                segs=8,
            )
        )
    for i in range(8):
        ang = (i * math.pi) / 4.0 + math.pi / 8.0
        body_parts.append(
            add_primitive_obj(
                f"r_rib_{i}",
                "box",
                pal["secondary"],
                loc=(math.sin(ang) * 0.256, -math.cos(ang) * 0.256, 0.46),
                rot=(0.0, 0.0, ang),
                size=(0.056, 0.068, 0.62),
                bevel_width=0.008,
            )
        )
    for i in range(4):
        ang = (i * math.pi) / 2.0
        sx, sy = math.sin(ang) * 0.236, -math.cos(ang) * 0.236
        body_parts.append(
            add_primitive_obj(
                f"r_slit_v_{i}",
                "box",
                pal["recess"],
                loc=(sx, sy, 0.62),
                rot=(0.0, 0.0, ang),
                size=(0.038, 0.035, 0.195),
            )
        )
        body_parts.append(
            add_primitive_obj(
                f"r_slit_h_{i}",
                "box",
                pal["recess"],
                loc=(sx, sy, 0.65),
                rot=(0.0, 0.0, ang),
                size=(0.090, 0.032, 0.028),
            )
        )
    bake_parts_into_joint_mesh("Mesh_Body_r", body_parts, body_pivot_w, pivot_body)

    # WeaponArm = upper articulated turret crown + siege ram (pivots at z = 0.81)
    weapon_pivot_w = Vector((0.0, 0.0, 0.81))
    pivot_weapon = make_empty("Pivot_WeaponArm_r", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_parts = [
        add_lathe_obj(
            "r_corbel",
            [
                (0.0, 0.81),
                (0.258, 0.81),
                (0.328, 0.95),
                (0.334, 1.11),
                (0.232, 1.11),
                (0.222, 1.03),
                (0.0, 1.03),
            ],
            8,
            pal["primary"],
            bevel_width=0.010,
            rot_z=math.pi / 8.0,
        ),
        add_primitive_obj(
            "r_rampart",
            "cyl",
            pal["recess"],
            loc=(0.0, 0.0, 1.04),
            rot=(0.0, 0.0, math.pi / 8.0),
            r_bot=0.224,
            r_top=0.224,
            height=0.022,
            segs=8,
        ),
        add_primitive_obj(
            "r_crown_band",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 0.965),
            rot=(0.0, 0.0, math.pi / 8.0),
            r_bot=0.330,
            r_top=0.338,
            height=0.044,
            segs=8,
            bevel_width=0.006,
        ),
        # Integrated front (-Y) golden siege ram prow
        add_primitive_obj(
            "r_ram_beam",
            "cyl",
            pal["secondary"],
            loc=(0.0, -0.30, 1.02),
            rot=(math.pi / 2.0, 0.0, 0.0),
            r_bot=0.056,
            r_top=0.068,
            height=0.22,
            segs=12,
            bevel_width=0.006,
        ),
        add_primitive_obj(
            "r_ram_head",
            "cone",
            pal["gold"],
            loc=(0.0, -0.445, 1.02),
            rot=(math.pi / 2.0, 0.0, 0.0),
            r_bot=0.078,
            height=0.16,
            segs=8,
            bevel_width=0.005,
        ),
    ]
    for i in range(8):
        ang = (i * math.pi) / 4.0
        mx, my = math.sin(ang) * 0.278, -math.cos(ang) * 0.278
        weapon_parts.append(
            add_primitive_obj(
                f"r_merlon_{i}",
                "box",
                pal["primary"],
                loc=(mx, my, 1.185),
                rot=(0.0, 0.0, ang),
                size=(0.128, 0.088, 0.158),
                bevel_width=0.009,
            )
        )
        weapon_parts.append(
            add_primitive_obj(
                f"r_merlon_cap_{i}",
                "box",
                pal["gold"],
                loc=(mx, my, 1.270),
                rot=(0.0, 0.0, ang),
                size=(0.140, 0.098, 0.030),
                bevel_width=0.006,
            )
        )
    bake_parts_into_joint_mesh("Mesh_WeaponArm_r", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_knight(pal) -> bpy.types.Object:
    root = make_empty("Piece_n")
    plinth_parts = build_plinth_parts(0.36, 0.14, pal)
    bake_parts_into_joint_mesh("Plinth_n", plinth_parts, Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.13))
    pivot_body = make_empty("Pivot_Body_n", body_pivot_w, root)

    # Organic Sub-D Armored Warhorse silhouette (in profile plane, extruded across X, facing -Y)
    horse_pts = [
        (0.16, 0.24),
        (0.29, 0.34),
        (0.28, 0.50),
        (0.24, 0.68),
        (0.35, 0.62),  # nose bridge
        (0.38, 0.67),  # muzzle
        (0.28, 0.81),  # brow
        (0.25, 0.91),  # ears
        (0.18, 0.85),  # poll
        (0.06, 0.66),  # arched neck back
        (-0.04, 0.54),
        (-0.18, 0.52),  # saddle seat
        (-0.30, 0.48),  # hindquarters
        (-0.31, 0.31),
        (-0.22, 0.22),
        (0.0, 0.20),
    ]
    # Extrude in 2D -> rotate so profile +X becomes Blender -Y (front) and profile +Y becomes Blender +Z (up)
    # Rotation Euler(pi/2, 0, -pi/2) maps local (+X, +Y, +Z) -> (0, -X, +Y)... wait check cleanly:
    # Rotate around X by +90deg: (x, y, z) -> (x, -z, y). Then rotate around Z by -90deg: (x', y', z') -> (y', -x', z') = (-z, -x, y).
    # So profile +X -> Blender -Y (FRONT!), profile +Y -> Blender +Z (UP!).
    body_parts = [
        add_extruded_poly_obj(
            "n_horse_body",
            horse_pts,
            depth=0.20,
            mat=pal["primary"],
            bevel_width=0.028,
            subsurf_levels=1,
            loc=(0.0, 0.0, 0.13),
            rot=(math.pi * 0.5, 0.0, -math.pi * 0.5),
        ),
        add_primitive_obj(
            "n_chamfron",
            "box",
            pal["gold"],
            loc=(0.0, -0.325, 0.835),
            rot=(-0.52, 0.0, 0.0),
            size=(0.112, 0.044, 0.185),
            bevel_width=0.008,
        ),
        add_primitive_obj(
            "n_chamfron_horn",
            "cone",
            pal["gold"],
            loc=(0.0, -0.365, 0.945),
            rot=(0.75, 0.0, 0.0),
            r_bot=0.022,
            height=0.115,
            segs=10,
        ),
        add_primitive_obj(
            "n_peytral",
            "sphere",
            pal["gold"],
            loc=(0.0, -0.25, 0.51),
            scale=(0.95, 0.55, 0.90),
            radius=0.142,
            segs=16,
        ),
        add_primitive_obj(
            "n_mane",
            "box",
            pal["gold"],
            loc=(0.0, -0.125, 0.83),
            rot=(0.44, 0.0, 0.0),
            size=(0.050, 0.078, 0.285),
            bevel_width=0.010,
        ),
        add_tube_obj(
            "n_tail",
            [(0.0, 0.28, 0.55), (0.0, 0.35, 0.47), (0.0, 0.33, 0.31)],
            0.035,
            pal["secondary"],
            taper_end=True,
        ),
        # Mounted Crusader Rider
        add_primitive_obj(
            "n_saddle",
            "box",
            pal["gold"],
            loc=(0.0, 0.05, 0.66),
            size=(0.245, 0.245, 0.082),
            bevel_width=0.012,
        ),
        add_primitive_obj(
            "n_rider_torso",
            "cyl",
            pal["primary"],
            loc=(0.0, 0.05, 0.84),
            scale=(1.15, 0.85, 1.0),
            r_bot=0.118,
            r_top=0.132,
            height=0.32,
            segs=16,
            bevel_width=0.010,
        ),
        add_primitive_obj(
            "n_rider_belt",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.05, 0.73),
            scale=(1.15, 0.85, 1.0),
            r_bot=0.130,
            r_top=0.130,
            height=0.042,
            segs=16,
            bevel_width=0.005,
        ),
    ]
    for lx, ly_front in ((-0.090, -0.16), (0.090, -0.16), (-0.096, 0.18), (0.096, 0.18)):
        is_front = ly_front < 0
        body_parts.append(
            add_primitive_obj(
                "n_leg",
                "cyl",
                pal["secondary"],
                loc=(lx, ly_front, 0.27),
                rot=(0.14 if is_front else -0.12, 0.0, 0.0),
                r_bot=0.033,
                r_top=0.043,
                height=0.28,
                segs=12,
            )
        )
        body_parts.append(
            add_primitive_obj(
                "n_hoof",
                "cyl",
                pal["gold"],
                loc=(lx, ly_front + (-0.02 if is_front else 0.02), 0.152),
                r_bot=0.045,
                r_top=0.037,
                height=0.046,
                segs=12,
            )
        )
    for sx in (-1.0, 1.0):
        body_parts.append(
            add_primitive_obj(
                "n_flank",
                "box",
                pal["secondary"],
                loc=(sx * 0.136, 0.02, 0.46),
                rot=(0.0, sx * 0.08, 0.0),
                size=(0.034, 0.425, 0.24),
                bevel_width=0.007,
            )
        )
        body_parts.append(
            add_primitive_obj(
                "n_flank_trim",
                "box",
                pal["gold"],
                loc=(sx * 0.144, 0.02, 0.35),
                size=(0.038, 0.435, 0.034),
                bevel_width=0.005,
            )
        )
        body_parts.append(
            add_primitive_obj(
                "n_greave",
                "cyl",
                pal["secondary"],
                loc=(sx * 0.156, 0.02, 0.57),
                rot=(0.22, sx * -0.16, 0.0),
                r_bot=0.035,
                r_top=0.043,
                height=0.25,
                segs=10,
            )
        )
    bake_parts_into_joint_mesh("Mesh_Body_n", body_parts, body_pivot_w, pivot_body)

    # Head: Crusader Great Helm + Gold Face Cross + Crest Plume
    head_pivot_w = Vector((0.0, 0.05, 1.00))
    pivot_head = make_empty("Pivot_Head_n", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = [
        add_primitive_obj(
            "n_helm",
            "cyl",
            pal["primary"],
            loc=(0.0, 0.05, 1.14),
            r_bot=0.123,
            r_top=0.115,
            height=0.275,
            segs=18,
            bevel_width=0.010,
        ),
        add_primitive_obj(
            "n_helm_top",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.05, 1.285),
            r_bot=0.115,
            r_top=0.098,
            height=0.032,
            segs=18,
            bevel_width=0.006,
        ),
        add_primitive_obj(
            "n_visor_slit",
            "box",
            pal["recess"],
            loc=(0.0, -0.058, 1.175),
            size=(0.142, 0.042, 0.028),
        ),
        add_primitive_obj(
            "n_cross_v",
            "box",
            pal["gold"],
            loc=(0.0, -0.069, 1.145),
            size=(0.025, 0.024, 0.212),
            bevel_width=0.004,
        ),
        add_primitive_obj(
            "n_cross_h",
            "box",
            pal["gold"],
            loc=(0.0, -0.069, 1.150),
            size=(0.146, 0.024, 0.023),
            bevel_width=0.004,
        ),
        add_tube_obj(
            "n_plume",
            [(0.0, 0.01, 1.30), (0.0, 0.08, 1.39), (0.0, 0.19, 1.34)],
            0.027,
            pal["gold"],
            taper_end=True,
        ),
    ]
    bake_parts_into_joint_mesh("Mesh_Head_n", head_parts, head_pivot_w, pivot_head)

    # Left ShieldArm (+X)
    shield_pivot_w = Vector((0.185, 0.04, 0.96))
    pivot_shield = make_empty("Pivot_ShieldArm_n", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.02, -0.16, -0.10))
    shield_parts = build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 0.92, pal)
    shield_parts += build_heater_shield_parts(
        shield_pivot_w + shield_hand_local + Vector((0.035, -0.03, 0.01)),
        (0.08, 0.0, 0.55),
        0.24,
        0.31,
        pal,
    )
    bake_parts_into_joint_mesh("Mesh_ShieldArm_n", shield_parts, shield_pivot_w, pivot_shield)

    # Right WeaponArm (-X) with Jousting Lance
    weapon_pivot_w = Vector((-0.185, 0.04, 0.96))
    pivot_weapon = make_empty("Pivot_WeaponArm_n", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.01, -0.17, -0.10))
    lance_grip_w = weapon_pivot_w + weapon_hand_local
    lance_tilt = 0.32
    rot_m = Matrix.Rotation(lance_tilt, 4, "X")

    def lpt(z_off: float) -> Vector:
        return lance_grip_w + (rot_m @ Vector((0.0, 0.0, z_off)))

    weapon_parts = build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 0.92, pal)
    weapon_parts += [
        add_primitive_obj(
            "n_lance_shaft",
            "cyl",
            pal["leather"],
            loc=lpt(0.12),
            rot=(lance_tilt, 0.0, 0.0),
            r_bot=0.024,
            r_top=0.018,
            height=0.73,
            segs=12,
        ),
        add_primitive_obj(
            "n_vamplate",
            "cone",
            pal["gold"],
            loc=lpt(0.08),
            rot=(lance_tilt, 0.0, 0.0),
            r_bot=0.084,
            height=0.110,
            segs=18,
            bevel_width=0.005,
        ),
        add_primitive_obj(
            "n_lance_collar",
            "cyl",
            pal["gold"],
            loc=lpt(0.46),
            rot=(lance_tilt, 0.0, 0.0),
            r_bot=0.028,
            r_top=0.028,
            height=0.038,
            segs=12,
            bevel_width=0.004,
        ),
        add_diamond_blade_obj(
            "n_lance_tip",
            length=0.22,
            base_half_w=0.035,
            shoulder_half_w=0.021,
            ridge=0.025,
            mat=pal["steel"],
            loc=lpt(0.48),
            rot=(lance_tilt, 0.0, 0.0),
        ),
    ]
    bake_parts_into_joint_mesh("Mesh_WeaponArm_n", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_bishop(pal) -> bpy.types.Object:
    root = make_empty("Piece_b")
    plinth_parts = build_plinth_parts(0.35, 0.14, pal)
    bake_parts_into_joint_mesh("Plinth_b", plinth_parts, Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.13))
    pivot_body = make_empty("Pivot_Body_b", body_pivot_w, root)

    body_parts = [
        add_lathe_obj(
            "b_robe",
            [
                (0.0, 0.13),
                (0.265, 0.13),
                (0.242, 0.31),
                (0.188, 0.69),
                (0.198, 0.91),
                (0.142, 1.02),
                (0.0, 1.02),
            ],
            30,
            pal["primary"],
            flute_amp=0.011,
            flute_count=10,
            subsurf_levels=1,
        ),
        add_primitive_obj(
            "b_stole",
            "box",
            pal["gold"],
            loc=(0.0, -0.228, 0.54),
            rot=(-0.14, 0.0, 0.0),
            size=(0.086, 0.030, 0.66),
            bevel_width=0.006,
        ),
        add_primitive_obj(
            "b_pectoral",
            "cyl",
            pal["secondary"],
            loc=(0.0, 0.0, 0.87),
            scale=(1.08, 0.84, 1.0),
            r_bot=0.172,
            r_top=0.186,
            height=0.23,
            segs=20,
            bevel_width=0.014,
        ),
        add_primitive_obj(
            "b_collar",
            "torus",
            pal["gold"],
            loc=(0.0, 0.0, 0.99),
            r_bot=0.148,
            r_top=0.017,
            segs=24,
        ),
    ]
    bake_parts_into_joint_mesh("Mesh_Body_b", body_parts, body_pivot_w, pivot_body)

    # Head: Prelate + Cleft Pointed Episcopal Mitre + Cross
    head_pivot_w = Vector((0.0, 0.0, 1.02))
    pivot_head = make_empty("Pivot_Head_b", head_pivot_w - body_pivot_w, pivot_body)

    mitre_pts = [
        (-0.115, 0.16),
        (0.115, 0.16),
        (0.130, 0.31),
        (0.068, 0.495),  # front horn
        (0.0, 0.34),      # cleft valley
        (-0.068, 0.495), # rear horn
        (-0.130, 0.31),
    ]
    head_parts = [
        add_primitive_obj("b_head_core", "sphere", pal["primary"], loc=(0.0, 0.0, 1.13), radius=0.106, segs=18),
        add_primitive_obj(
            "b_beard",
            "cone",
            pal["secondary"],
            loc=(0.0, -0.068, 1.075),
            rot=(math.pi, 0.0, 0.0),
            r_bot=0.076,
            height=0.125,
            segs=14,
            bevel_width=0.008,
        ),
        add_primitive_obj("b_eyes", "box", pal["recess"], loc=(0.0, -0.092, 1.15), size=(0.116, 0.042, 0.032)),
        add_extruded_poly_obj(
            "b_mitre",
            mitre_pts,
            depth=0.17,
            mat=pal["primary"],
            bevel_width=0.022,
            subsurf_levels=1,
            loc=(0.0, 0.0, 1.02),
            rot=(math.pi * 0.5, 0.0, -math.pi * 0.5),
        ),
        add_primitive_obj(
            "b_mitre_band",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 1.195),
            r_bot=0.128,
            r_top=0.130,
            height=0.034,
            segs=20,
            bevel_width=0.005,
        ),
    ]
    head_parts += build_latin_cross_parts(Vector((0.0, -0.142, 1.28)), 0.15, 0.10, 0.022, pal, tilt_x=0.18)
    bake_parts_into_joint_mesh("Mesh_Head_b", head_parts, head_pivot_w, pivot_head)

    # Left ShieldArm (+X) cradling Open Illuminated Tome
    shield_pivot_w = Vector((0.22, -0.02, 0.95))
    pivot_shield = make_empty("Pivot_ShieldArm_b", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.03, -0.19, -0.11))
    shield_parts = build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 1.0, pal)

    tome_center = shield_pivot_w + shield_hand_local + Vector((0.02, -0.06, 0.04))
    tome_rot = Euler((-0.62, 0.10, -0.25), "XYZ").to_matrix().to_4x4()
    for sx in (-1.0, 1.0):
        wing_m = tome_rot @ Matrix.Rotation(sx * 0.38, 4, "Z")
        cover_off = wing_m @ Vector((sx * 0.062, 0.0, 0.0))
        page_off = wing_m @ Vector((sx * 0.062, -0.016, 0.0))
        shield_parts.append(
            add_primitive_obj(
                "b_tome_cover",
                "box",
                pal["leather"],
                loc=tome_center + cover_off,
                rot=wing_m.to_euler(),
                size=(0.135, 0.016, 0.182),
                bevel_width=0.004,
            )
        )
        shield_parts.append(
            add_primitive_obj(
                "b_tome_page",
                "box",
                pal["parchment"],
                loc=tome_center + page_off,
                rot=wing_m.to_euler(),
                size=(0.120, 0.022, 0.164),
                bevel_width=0.003,
            )
        )
    shield_parts.append(
        add_primitive_obj(
            "b_tome_spine",
            "cyl",
            pal["gold"],
            loc=tome_center,
            rot=tome_rot.to_euler(),
            r_bot=0.015,
            r_top=0.015,
            height=0.188,
            segs=10,
        )
    )
    bake_parts_into_joint_mesh("Mesh_ShieldArm_b", shield_parts, shield_pivot_w, pivot_shield)

    # Right WeaponArm (-X) gripping Spiral Golden Crosier
    weapon_pivot_w = Vector((-0.22, -0.02, 0.95))
    pivot_weapon = make_empty("Pivot_WeaponArm_b", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.02, -0.19, -0.10))
    c_grip = weapon_pivot_w + weapon_hand_local
    c_rot = Matrix.Rotation(0.06, 4, "X")

    def cpt(y_off: float, z_off: float) -> Vector:
        return c_grip + (c_rot @ Vector((0.0, y_off, z_off)))

    crook_pts = [cpt(0.0, 0.35)]
    steps = 28
    turns = 1.25
    for i in range(steps + 1):
        t = i / steps
        ang = -math.pi * 0.5 + t * math.pi * 2.0 * turns
        rad = 0.145 * (1.0 - t * 0.65)
        # Angle spiral 32 degrees in XY so golden crosier volute reads clearly from both front & side!
        radial = -(0.04 + math.cos(ang) * rad)
        crook_pts.append(cpt(radial * 0.85, 0.52 + math.sin(ang) * rad))
        crook_pts[-1].x += radial * 0.52

    weapon_parts = build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 1.0, pal)
    weapon_parts += [
        add_primitive_obj(
            "b_staff",
            "cyl",
            pal["leather"],
            loc=cpt(0.0, -0.14),
            rot=(0.06, 0.0, 0.0),
            r_bot=0.019,
            r_top=0.019,
            height=0.92,
            segs=12,
        ),
        add_primitive_obj(
            "b_ferrule",
            "cyl",
            pal["gold"],
            loc=cpt(0.0, -0.60),
            rot=(0.06, 0.0, 0.0),
            r_bot=0.012,
            r_top=0.027,
            height=0.092,
            segs=12,
        ),
        add_primitive_obj(
            "b_lantern",
            "cyl",
            pal["gold"],
            loc=cpt(0.0, 0.34),
            rot=(0.06, 0.0, 0.0),
            r_bot=0.028,
            r_top=0.038,
            height=0.068,
            segs=8,
            bevel_width=0.005,
        ),
        add_tube_obj("b_crook", crook_pts, 0.023, pal["gold"], resolution=10, bevel_res=6),
    ]
    weapon_parts += build_latin_cross_parts(cpt(-0.035, 0.47) + Vector((-0.02, 0.0, 0.0)), 0.09, 0.065, 0.016, pal, tilt_x=0.06)
    bake_parts_into_joint_mesh("Mesh_WeaponArm_b", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_queen(pal) -> bpy.types.Object:
    root = make_empty("Piece_q")
    plinth_parts = build_plinth_parts(0.36, 0.15, pal)
    bake_parts_into_joint_mesh("Plinth_q", plinth_parts, Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.14))
    pivot_body = make_empty("Pivot_Body_q", body_pivot_w, root)

    body_parts = [
        add_lathe_obj(
            "q_gown",
            [
                (0.0, 0.14),
                (0.288, 0.14),
                (0.262, 0.34),
                (0.188, 0.68),
                (0.158, 0.84),
                (0.208, 1.04),
                (0.178, 1.12),
                (0.118, 1.15),
                (0.0, 1.15),
            ],
            36,
            pal["primary"],
            flute_amp=0.013,
            flute_count=12,
            scale_xyz=(1.04, 0.94, 1.0),
            subsurf_levels=1,
        ),
        add_primitive_obj(
            "q_hem_ring",
            "torus",
            pal["gold"],
            loc=(0.0, 0.0, 0.18),
            scale=(1.04, 0.94, 1.0),
            r_bot=0.280,
            r_top=0.014,
            segs=28,
        ),
        add_primitive_obj(
            "q_girdle",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 0.84),
            r_bot=0.170,
            r_top=0.166,
            height=0.052,
            segs=24,
            bevel_width=0.006,
        ),
        add_primitive_obj(
            "q_chest_gem",
            "octa",
            pal["gold"],
            loc=(0.0, -0.182, 1.00),
            scale=(1.0, 0.45, 1.3),
            radius=0.056,
        ),
    ]
    bake_parts_into_joint_mesh("Mesh_Body_q", body_parts, body_pivot_w, pivot_body)

    # Head: Veiled Warrior Sovereign + 8-Spiked Golden Coronet (height 1.68)
    head_pivot_w = Vector((0.0, 0.0, 1.15))
    pivot_head = make_empty("Pivot_Head_q", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = [
        add_primitive_obj("q_head_core", "sphere", pal["primary"], loc=(0.0, 0.0, 1.26), radius=0.106, segs=18),
        add_primitive_obj(
            "q_veil",
            "cyl",
            pal["secondary"],
            loc=(0.0, 0.085, 1.19),
            rot=(0.14, 0.0, 0.0),
            scale=(0.95, 0.48, 1.0),
            r_bot=0.150,
            r_top=0.104,
            height=0.28,
            segs=16,
            bevel_width=0.010,
        ),
        add_primitive_obj("q_brow", "box", pal["recess"], loc=(0.0, -0.092, 1.275), size=(0.102, 0.038, 0.028)),
        add_primitive_obj(
            "q_circlet",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 1.335),
            r_bot=0.114,
            r_top=0.128,
            height=0.056,
            segs=24,
            bevel_width=0.006,
        ),
        add_primitive_obj("q_coronet_cap", "sphere", pal["primary"], loc=(0.0, 0.0, 1.355), radius=0.102, segs=16),
        add_primitive_obj(
            "q_apex_stem",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 1.50),
            r_bot=0.032,
            r_top=0.016,
            height=0.16,
            segs=10,
        ),
        add_primitive_obj(
            "q_apex_orb",
            "octa",
            pal["gold"],
            loc=(0.0, 0.0, 1.625),
            scale=(0.8, 0.8, 1.4),
            radius=0.044,
        ),
    ]
    for i in range(8):
        ang = (i * math.pi) / 4.0
        base = Vector((math.sin(ang) * 0.116, -math.cos(ang) * 0.116, 1.36))
        # Positive +0.20 around X flares the 8 crown spikes majestically outward
        rot_m = Matrix.Rotation(ang, 4, "Z") @ Matrix.Rotation(0.20, 4, "X")
        sp_off = rot_m @ Vector((0.0, 0.0, 0.115))
        pr_off = rot_m @ Vector((0.0, 0.0, 0.235))
        head_parts.append(
            add_primitive_obj(
                f"q_spike_{i}",
                "cone",
                pal["gold"],
                loc=base + sp_off,
                rot=rot_m.to_euler(),
                r_bot=0.025,
                height=0.23,
                segs=8,
            )
        )
        head_parts.append(
            add_primitive_obj(
                f"q_pearl_{i}",
                "sphere",
                pal["gold"],
                loc=base + pr_off,
                radius=0.020,
                segs=10,
            )
        )
    bake_parts_into_joint_mesh("Mesh_Head_q", head_parts, head_pivot_w, pivot_head)

    # Left ShieldArm (+X) holding Royal Buckler
    shield_pivot_w = Vector((0.22, -0.02, 1.08))
    pivot_shield = make_empty("Pivot_ShieldArm_q", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.03, -0.18, -0.10))
    buck_center = shield_pivot_w + shield_hand_local + Vector((0.04, -0.03, 0.01))
    buck_rot = Euler((0.06, 0.0, 0.58), "YXZ").to_matrix().to_4x4()
    buck_cyl_euler = (buck_rot @ Matrix.Rotation(math.pi * 0.5, 4, "X")).to_euler()
    buck_boss_off = buck_rot @ Vector((0.0, -0.024, 0.0))

    shield_parts = build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 1.0, pal)
    shield_parts += [
        add_primitive_obj(
            "q_buckler_body",
            "cyl",
            pal["primary"],
            loc=buck_center,
            rot=buck_cyl_euler,
            r_bot=0.136,
            r_top=0.136,
            height=0.028,
            segs=24,
            bevel_width=0.005,
        ),
        add_primitive_obj(
            "q_buckler_rim",
            "torus",
            pal["gold"],
            loc=buck_center,
            rot=buck_cyl_euler,
            r_bot=0.134,
            r_top=0.016,
            segs=24,
        ),
        add_primitive_obj(
            "q_buckler_boss",
            "cone",
            pal["gold"],
            loc=buck_center + buck_boss_off,
            rot=(buck_rot @ Matrix.Rotation(math.pi * 0.5, 4, "X")).to_euler(),
            r_bot=0.046,
            height=0.050,
            segs=10,
        ),
    ]
    bake_parts_into_joint_mesh("Mesh_ShieldArm_q", shield_parts, shield_pivot_w, pivot_shield)

    # Right WeaponArm (-X) wielding Three-Pronged Golden Trident
    weapon_pivot_w = Vector((-0.22, -0.02, 1.08))
    pivot_weapon = make_empty("Pivot_WeaponArm_q", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.02, -0.18, -0.10))
    t_grip = weapon_pivot_w + weapon_hand_local
    t_rot = Matrix.Rotation(0.08, 4, "X")

    def tpt(x_off: float, z_off: float) -> Vector:
        return t_grip + (t_rot @ Vector((x_off, 0.0, z_off)))

    weapon_parts = build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 1.0, pal)
    weapon_parts += [
        add_primitive_obj(
            "q_trident_shaft",
            "cyl",
            pal["gold"],
            loc=tpt(0.0, -0.14),
            rot=(0.08, 0.0, 0.0),
            r_bot=0.019,
            r_top=0.019,
            height=1.02,
            segs=12,
        ),
        add_primitive_obj(
            "q_trident_bar",
            "box",
            pal["gold"],
            loc=tpt(0.0, 0.37),
            rot=(0.08, 0.0, 0.0),
            size=(0.205, 0.040, 0.038),
            bevel_width=0.006,
        ),
        add_diamond_blade_obj(
            "q_trident_center",
            length=0.36,
            base_half_w=0.035,
            shoulder_half_w=0.023,
            ridge=0.025,
            mat=pal["steel"],
            loc=tpt(0.0, 0.38),
            rot=(0.08, 0.0, 0.0),
        ),
    ]
    for sx in (-1.0, 1.0):
        weapon_parts.append(
            add_tube_obj(
                f"q_tine_{sx}",
                [tpt(sx * 0.08, 0.37), tpt(sx * 0.125, 0.47), tpt(sx * 0.095, 0.62)],
                0.015,
                pal["gold"],
            )
        )
        tip_rot = (t_rot @ Matrix.Rotation(sx * -0.16, 4, "Y")).to_euler()
        weapon_parts.append(
            add_primitive_obj(
                f"q_tine_tip_{sx}",
                "cone",
                pal["gold"],
                loc=tpt(sx * 0.092, 0.648),
                rot=tip_rot,
                r_bot=0.019,
                height=0.068,
                segs=8,
            )
        )
    bake_parts_into_joint_mesh("Mesh_WeaponArm_q", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_king(pal) -> bpy.types.Object:
    root = make_empty("Piece_k")
    plinth_parts = build_plinth_parts(0.38, 0.16, pal)
    bake_parts_into_joint_mesh("Plinth_k", plinth_parts, Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.15))
    pivot_body = make_empty("Pivot_Body_k", body_pivot_w, root)

    body_parts = [
        add_lathe_obj(
            "k_surcoat",
            [
                (0.0, 0.15),
                (0.298, 0.15),
                (0.268, 0.37),
                (0.218, 0.77),
                (0.248, 1.11),
                (0.222, 1.24),
                (0.138, 1.30),
                (0.0, 1.30),
            ],
            28,
            pal["primary"],
            flute_amp=0.008,
            flute_count=10,
            scale_xyz=(1.08, 0.90, 1.0),
            subsurf_levels=1,
        ),
        # Draped Royal Mantle behind (+Y)
        add_primitive_obj(
            "k_mantle",
            "cyl",
            pal["secondary"],
            loc=(0.0, 0.165, 0.68),
            rot=(0.10, 0.0, 0.0),
            scale=(0.82, 0.28, 1.0),
            r_bot=0.265,
            r_top=0.185,
            height=1.00,
            segs=16,
            bevel_width=0.012,
        ),
        add_primitive_obj(
            "k_belt",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 0.83),
            scale=(1.08, 0.90, 1.0),
            r_bot=0.228,
            r_top=0.232,
            height=0.056,
            segs=24,
            bevel_width=0.006,
        ),
        add_primitive_obj(
            "k_chain",
            "torus",
            pal["gold"],
            loc=(0.0, -0.06, 1.17),
            rot=(0.42, 0.0, 0.0),
            r_bot=0.186,
            r_top=0.019,
            segs=26,
        ),
        add_primitive_obj(
            "k_medallion",
            "octa",
            pal["gold"],
            loc=(0.0, -0.230, 1.07),
            scale=(1.0, 0.45, 1.2),
            radius=0.058,
        ),
    ]
    bake_parts_into_joint_mesh("Mesh_Body_k", body_parts, body_pivot_w, pivot_body)

    # Head: High Monarch + Arched Imperial Crown + Orb & Cross (height 1.88)
    head_pivot_w = Vector((0.0, 0.0, 1.30))
    pivot_head = make_empty("Pivot_Head_k", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = [
        add_primitive_obj("k_head_core", "sphere", pal["primary"], loc=(0.0, 0.0, 1.425), radius=0.119, segs=18),
        add_primitive_obj(
            "k_beard",
            "cone",
            pal["secondary"],
            loc=(0.0, -0.076, 1.365),
            rot=(math.pi, 0.0, 0.0),
            r_bot=0.089,
            height=0.138,
            segs=14,
            bevel_width=0.008,
        ),
        add_primitive_obj("k_visor", "box", pal["recess"], loc=(0.0, -0.104, 1.445), size=(0.126, 0.042, 0.034)),
        add_primitive_obj(
            "k_crown_circlet",
            "cyl",
            pal["gold"],
            loc=(0.0, 0.0, 1.51),
            r_bot=0.126,
            r_top=0.140,
            height=0.066,
            segs=24,
            bevel_width=0.006,
        ),
        add_primitive_obj("k_crown_cap", "sphere", pal["primary"], loc=(0.0, 0.0, 1.535), radius=0.120, segs=16),
        add_primitive_obj("k_crown_orb", "sphere", pal["gold"], loc=(0.0, 0.0, 1.745), radius=0.038, segs=12),
    ]
    for i in range(8):
        ang = (i * math.pi) / 4.0
        head_parts.append(
            add_primitive_obj(
                f"k_crown_leaf_{i}",
                "cone",
                pal["gold"],
                loc=(math.sin(ang) * 0.132, -math.cos(ang) * 0.132, 1.575),
                r_bot=0.027,
                height=0.082,
                segs=8,
            )
        )
    # Two intersecting imperial crown arches
    head_parts.append(
        add_tube_obj(
            "k_arch_x",
            [(-0.132, 0.0, 1.535), (-0.11, 0.0, 1.67), (0.0, 0.0, 1.725), (0.11, 0.0, 1.67), (0.132, 0.0, 1.535)],
            0.018,
            pal["gold"],
        )
    )
    head_parts.append(
        add_tube_obj(
            "k_arch_y",
            [(0.0, -0.132, 1.535), (0.0, -0.11, 1.67), (0.0, 0.0, 1.725), (0.0, 0.11, 1.67), (0.0, 0.132, 1.535)],
            0.018,
            pal["gold"],
        )
    )
    head_parts += build_latin_cross_parts(Vector((0.0, 0.0, 1.765)), 0.115, 0.085, 0.021, pal)
    bake_parts_into_joint_mesh("Mesh_Head_k", head_parts, head_pivot_w, pivot_head)

    # Paired Two-Handed Greatsword Grip (identical shoulder Z=1.22, Y=-0.03 so -2.55 -> -1.12 cleaves locked!)
    weapon_pivot_w = Vector((-0.255, -0.03, 1.22))
    pivot_weapon = make_empty("Pivot_WeaponArm_k", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((0.255, -0.23, -0.15))
    weapon_parts = build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 1.12, pal)
    weapon_parts += build_sword_parts(
        Vector((0.0, -0.26, 1.10)),
        0.77,
        0.090,
        0.33,
        0.20,
        point_down=True,
        pal=pal,
    )
    bake_parts_into_joint_mesh("Mesh_WeaponArm_k", weapon_parts, weapon_pivot_w, pivot_weapon)

    shield_pivot_w = Vector((0.255, -0.03, 1.22))
    pivot_shield = make_empty("Pivot_ShieldArm_k", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((-0.255, -0.23, -0.09))
    shield_parts = build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 1.12, pal)
    bake_parts_into_joint_mesh("Mesh_ShieldArm_k", shield_parts, shield_pivot_w, pivot_shield)
    return root


ARCHETYPE_BUILDERS = {
    "p": build_pawn,
    "r": build_rook,
    "n": build_knight,
    "b": build_bishop,
    "q": build_queen,
    "k": build_king,
}


# ---------------------------------------------------------------------------
# Export & Preview Render Pipeline
# ---------------------------------------------------------------------------

def select_hierarchy(roots) -> None:
    bpy.ops.object.select_all(action="DESELECT")

    def walk(obj):
        obj.select_set(True)
        for c in obj.children:
            walk(c)

    for r in roots:
        walk(r)


def render_preview_lineup(white_glb: str, black_glb: str, out_path: str) -> None:
    """Imports the actual exported GLB files and renders all 12 pieces via EEVEE for visual QA."""
    reset_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.filepath = out_path
    vt_items = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items]
    scene.view_settings.view_transform = "AgX" if "AgX" in vt_items else "Standard"

    order = ["p", "r", "n", "b", "q", "k"]

    def import_row(glb_path: str, y_pos: float, yaw_z: float):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        added = [o for o in bpy.data.objects if o not in before and o.parent is None]
        for idx, ptype in enumerate(order):
            match = next((o for o in added if o.name.startswith(f"Piece_{ptype}")), None)
            if match is not None:
                match.rotation_mode = "XYZ"
                match.location = ((idx - 2.5) * 1.12, y_pos, 0.0)
                match.rotation_euler = (0.0, 0.0, yaw_z)

    import_row(white_glb, -0.78, 0.0)
    import_row(black_glb, 0.82, 0.0)

    # Dark sanctum studio backdrop & warm-cool rim lighting
    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.045, 0.052, 0.075, 1.0)
    bg.inputs["Strength"].default_value = 2.0
    scene.world = world

    add_primitive_obj(
        "PreviewFloor",
        "box",
        create_pbr_material("PreviewFloorMat", base_color=(0.11, 0.12, 0.16, 1.0), metallic=0.1, roughness=0.35),
        loc=(0.0, 0.0, -0.05),
        size=(12.0, 8.0, 0.1),
    )

    def add_light(name, ltype, loc, rot, energy, color):
        ldata = bpy.data.lights.new(name, type=ltype)
        ldata.energy = energy
        ldata.color = color
        if ltype == "AREA":
            ldata.size = 5.0
        lobj = bpy.data.objects.new(name, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = loc
        lobj.rotation_euler = rot
        return lobj

    add_light("Key", "AREA", (3.5, -5.5, 5.5), (math.radians(52), 0.0, math.radians(32)), 480.0, (1.0, 0.90, 0.74))
    add_light("Fill", "AREA", (-5.0, -4.0, 3.5), (math.radians(60), 0.0, math.radians(-48)), 220.0, (0.62, 0.76, 1.0))
    add_light("Rim", "AREA", (0.0, 4.8, 4.5), (math.radians(-52), 0.0, 0.0), 340.0, (1.0, 0.80, 0.45))

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 42.0
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -8.8, 3.15)
    cam.rotation_euler = (math.radians(74.5), 0.0, 0.0)
    scene.camera = cam

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.render.render(write_still=True)


def build_and_export() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    exported_paths = {}

    for variant in ("w", "b"):
        reset_scene()
        pal = build_palette(variant)
        roots = [builder(pal) for builder in ARCHETYPE_BUILDERS.values()]

        select_hierarchy(roots)
        filename = "wizard_white.glb" if variant == "w" else "wizard_black.glb"
        out_path = os.path.join(OUT_DIR, filename)
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_image_format="WEBP",
            export_image_quality=88,
            export_animations=False,
        )
        exported_paths[variant] = out_path
        size_kb = os.path.getsize(out_path) / 1024.0
        print(f"[EXPORTED] {out_path} ({size_kb:.1f} KB)")

    if RENDER_PREVIEW_PATH:
        render_preview_lineup(exported_paths["w"], exported_paths["b"], RENDER_PREVIEW_PATH)
        print(f"[PREVIEW] {RENDER_PREVIEW_PATH}")


if __name__ == "__main__":
    build_and_export()
