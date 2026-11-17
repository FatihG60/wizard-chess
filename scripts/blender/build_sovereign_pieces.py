"""Headless Blender 5.3 generator for the collector-grade Sovereign Reliquary 3D chess set.

Generates:
  - public/models/sovereign_white.glb (Carrara Ivory + Imperial Gold + Sapphire Gems + Crimson Velvet)
  - public/models/sovereign_black.glb (Volcanic Obsidian + Imperial Gold + Ruby Gems + Deep Violet Velvet)
  - Optional 1920x1080 studio renders (lineup, closeup, rear) when SOVEREIGN_RENDER_DIR is set.

Follows the exact Wizard Chess coordinate & joint contract for Three.js GLTFLoader (export_yup=True):
  - Blender +Z -> Three.js +Y (up)
  - Blender -Y -> Three.js +Z (piece front/forward)
  - Blender -X -> Three.js -X (weapon side)
  - Blender +X -> Three.js +X (shield side)

Hierarchy per piece `<type>` in {p, r, n, b, q, k}:
  Piece_<type> (origin 0,0,0)
    Plinth_<type>
    Pivot_Body_<type>
      Mesh_Body_<type>
      Pivot_Head_<type>
        Mesh_Head_<type>
      Pivot_WeaponArm_<type>
        Mesh_WeaponArm_<type>
      Pivot_ShieldArm_<type>   (p, n, b, q, k)
        Mesh_ShieldArm_<type>
"""

import math
import os
import sys
import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import build_wizard_pieces as base  # noqa: E402

PROJECT_ROOT = base.PROJECT_ROOT
OUT_DIR = base.OUT_DIR
RENDER_DIR = os.environ.get("SOVEREIGN_RENDER_DIR", "").strip()


# ---------------------------------------------------------------------------
# 7-Material 2K PBR + Emissive Arcane Gem Palette
# ---------------------------------------------------------------------------

def build_sovereign_palette(variant: str):
    """Builds 7-material 2K PBR palette with emissive gems and royal velvet drapery."""
    is_w = variant == "w"
    p_alb, p_rgh, p_nrm = base.generate_stone_textures(variant, res=2048)
    g_alb, g_rgh, g_nrm = base.generate_brushed_metal_textures(
        f"SovGold_{variant}",
        (0.89, 0.72, 0.23),
        0.18,
        seed=7101 if is_w else 7202,
        res=1024,
    )
    steel_rgb = (0.85, 0.89, 0.94) if is_w else (0.64, 0.70, 0.78)
    s_alb, s_rgh, s_nrm = base.generate_brushed_metal_textures(
        f"SovSteel_{variant}",
        steel_rgb,
        0.15,
        seed=8101 if is_w else 8202,
        res=1024,
    )

    primary = base.create_pbr_material(
        f"Mat_Primary_{variant}",
        albedo_img=p_alb,
        rough_img=p_rgh,
        normal_img=p_nrm,
        metallic=0.04 if is_w else 0.16,
        coat_weight=0.42 if is_w else 0.55,
        coat_roughness=0.12,
        normal_strength=0.34,
    )
    secondary = base.create_pbr_material(
        f"Mat_Secondary_{variant}",
        rough_img=p_rgh,
        normal_img=p_nrm,
        base_color=(0.76, 0.69, 0.58, 1.0) if is_w else (0.11, 0.125, 0.185, 1.0),
        metallic=0.22 if is_w else 0.30,
        roughness=0.32,
        coat_weight=0.22,
        normal_strength=0.25,
    )
    gold = base.create_pbr_material(
        f"Mat_Gold_{variant}",
        albedo_img=g_alb,
        rough_img=g_rgh,
        normal_img=g_nrm,
        metallic=0.95,
        roughness=0.18,
        coat_weight=0.20,
        normal_strength=0.22,
    )
    steel = base.create_pbr_material(
        f"Mat_Steel_{variant}",
        albedo_img=s_alb,
        rough_img=s_rgh,
        normal_img=s_nrm,
        metallic=0.96,
        roughness=0.15,
        coat_weight=0.18,
        normal_strength=0.20,
    )
    velvet_rgb = (0.24, 0.024, 0.036, 1.0) if is_w else (0.085, 0.022, 0.155, 1.0)
    velvet = base.create_pbr_material(
        f"Mat_Velvet_{variant}",
        rough_img=p_rgh,
        base_color=velvet_rgb,
        metallic=0.04,
        roughness=0.58,
        coat_weight=0.05,
        normal_strength=0.12,
    )

    gem_color = (0.18, 0.72, 1.0, 1.0) if is_w else (1.0, 0.24, 0.08, 1.0)
    gem = base.create_pbr_material(
        f"Mat_Gem_{variant}",
        base_color=gem_color,
        metallic=0.08,
        roughness=0.08,
        coat_weight=0.85,
        coat_roughness=0.06,
    )
    gem_bsdf = next(n for n in gem.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    base.set_bsdf_input(gem_bsdf, "Emission Color", gem_color)
    base.set_bsdf_input(gem_bsdf, "Emission Strength", 3.2)

    recess = base.create_pbr_material(
        f"Mat_Recess_{variant}",
        base_color=(0.02, 0.022, 0.032, 1.0),
        metallic=0.14,
        roughness=0.82,
    )
    leather = base.create_pbr_material(
        f"Mat_Leather_{variant}",
        base_color=(0.24, 0.14, 0.09, 1.0) if is_w else (0.11, 0.08, 0.065, 1.0),
        metallic=0.05,
        roughness=0.54,
    )
    parchment = base.create_pbr_material(
        f"Mat_Parchment_{variant}",
        base_color=(0.93, 0.87, 0.73, 1.0),
        metallic=0.02,
        roughness=0.66,
    )

    return {
        "primary": primary,
        "secondary": secondary,
        "gold": gold,
        "steel": steel,
        "velvet": velvet,
        "gem": gem,
        "recess": recess,
        "leather": leather,
        "parchment": parchment,
    }


# ---------------------------------------------------------------------------
# Advanced Organic & Reliquary BMesh Sculpting Helpers
# ---------------------------------------------------------------------------

def add_lofted_obj(
    name: str,
    stations,
    segments: int,
    mat: bpy.types.Material,
    arc_start: float = 0.0,
    arc_span: float = math.pi * 2.0,
    closed_loop: bool = True,
    pleat_amp: float = 0.0,
    pleat_count: int = 0,
    thickness: float = 0.0,
    subsurf_levels: int = 1,
    bevel_width: float = 0.0,
) -> bpy.types.Object:
    """Lofts a smooth 3D multi-station organic form or pleated cape drape along arbitrary spine points.

    Each station is `(center_xyz, rx, ry, pitch_x, yaw_z)`.
    When `closed_loop=False` and `thickness > 0`, generates a solid thickened curved shell
    (used for billowing pleated cloaks and curved feathered wings!).
    """
    bm = bmesh.new()

    def build_ring(center, rx, ry, pitch_x, yaw_z, r_offset=0.0):
        rot_m = Matrix.Rotation(yaw_z, 4, "Z") @ Matrix.Rotation(pitch_x, 4, "X")
        c_vec = Vector(center)
        pts = []
        steps = segments if closed_loop else max(3, segments + 1)
        for i in range(steps):
            t = (i / segments) if closed_loop else (i / (steps - 1))
            ang = arc_start + t * arc_span
            pleat = 0.0
            if pleat_amp != 0.0 and pleat_count > 0:
                phase = pleat_count * t * math.pi * (2.0 if closed_loop else 1.0)
                pleat = pleat_amp * (math.cos(phase) + 0.32 * math.sin(phase * 2.0 + 0.7))
            lx = math.cos(ang) * max(1e-4, rx + pleat + r_offset)
            ly = math.sin(ang) * max(1e-4, ry + pleat + r_offset)
            pts.append(bm.verts.new(c_vec + (rot_m @ Vector((lx, ly, 0.0)))))
        return pts

    if closed_loop or thickness <= 0.0:
        rings = [build_ring(*st) for st in stations]
        n_ring = len(rings[0])
        for s_idx in range(len(rings) - 1):
            a, b = rings[s_idx], rings[s_idx + 1]
            span = n_ring if closed_loop else (n_ring - 1)
            for i in range(span):
                j = (i + 1) % n_ring
                bm.faces.new((a[i], a[j], b[j], b[i]))
        if closed_loop:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
    else:
        outer_rings = [build_ring(*st, r_offset=thickness * 0.5) for st in stations]
        inner_rings = [build_ring(*st, r_offset=-thickness * 0.5) for st in stations]
        n_ring = len(outer_rings[0])
        for s_idx in range(len(stations) - 1):
            oa, ob = outer_rings[s_idx], outer_rings[s_idx + 1]
            ia, ib = inner_rings[s_idx], inner_rings[s_idx + 1]
            for i in range(n_ring - 1):
                bm.faces.new((oa[i], oa[i + 1], ob[i + 1], ob[i]))
                bm.faces.new((ib[i], ib[i + 1], ia[i + 1], ia[i]))
            # Side hem edges
            bm.faces.new((ia[0], oa[0], ob[0], ib[0]))
            bm.faces.new((oa[-1], ia[-1], ib[-1], ob[-1]))
        # Top & bottom hem closures
        for i in range(n_ring - 1):
            bm.faces.new((inner_rings[0][i], outer_rings[0][i], outer_rings[0][i + 1], inner_rings[0][i + 1]))
            bm.faces.new((outer_rings[-1][i], inner_rings[-1][i], inner_rings[-1][i + 1], outer_rings[-1][i + 1]))

    obj = base._new_obj(name, bm, mat)
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
    es.split_angle = math.radians(44.0)
    return obj


def add_gem_obj(
    name: str,
    center,
    radius: float,
    pal,
    rot=(0.0, 0.0, 0.0),
    stretch_z: float = 1.25,
    with_bezel: bool = True,
):
    """Creates a faceted glowing gemstone inside an octagonal gold bezel."""
    parts = [
        base.add_primitive_obj(
            f"{name}_stone",
            "octa",
            pal["gem"],
            loc=center,
            rot=rot,
            scale=(1.0, 0.72, stretch_z),
            radius=radius,
            edge_split=False,
        )
    ]
    if with_bezel:
        parts.append(
            base.add_primitive_obj(
                f"{name}_bezel",
                "torus",
                pal["gold"],
                loc=center,
                rot=rot,
                scale=(1.0, 1.0, stretch_z * 0.9),
                r_bot=radius * 1.05,
                r_top=max(0.005, radius * 0.28),
                segs=10,
            )
        )
    return parts


def add_flamberge_blade_obj(
    name: str,
    length: float,
    base_half_w: float,
    ridge: float,
    mat: bpy.types.Material,
    loc=(0.0, 0.0, 0.0),
    rot=(0.0, 0.0, 0.0),
) -> bpy.types.Object:
    """Diamond-section wavy Flamberge greatsword blade along +Z from z=0 to z=length."""
    bm = bmesh.new()
    slices = 14
    rings = []
    for i in range(slices):
        t = i / slices
        z = t * length * 0.88
        taper = 1.0 - 0.35 * t
        wave = math.sin(t * math.pi * 5.0) * base_half_w * 0.24 * (1.0 - t * 0.5)
        hw = base_half_w * taper
        hr = ridge * taper
        L = bm.verts.new((-hw + wave, 0.0, z))
        F = bm.verts.new((wave * 0.3, -hr, z))
        R = bm.verts.new((hw + wave, 0.0, z))
        B = bm.verts.new((wave * 0.3, hr, z))
        rings.append((L, F, R, B))

    tip = bm.verts.new((0.0, 0.0, length))
    bm.faces.new((rings[0][0], rings[0][2], rings[0][1]))
    bm.faces.new((rings[0][2], rings[0][0], rings[0][3]))
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(4):
            nk = (k + 1) % 4
            bm.faces.new((a[k], a[nk], b[nk], b[k]))
    top = rings[-1]
    for k in range(4):
        nk = (k + 1) % 4
        bm.faces.new((top[k], top[nk], tip))

    obj = base._new_obj(name, bm, mat)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def build_reliquary_plinth(radius: float, height: float, pal, octagonal: bool = False):
    """Ornate Gothic Reliquary plinth with 8 lancet arch niches, buttresses, rope rings & 4 glowing gems."""
    segs = 8 if octagonal else 32
    rot_z = math.pi / 8.0 if octagonal else 0.0
    pts = [
        (0.0, 0.0),
        (radius, 0.0),
        (radius, height * 0.18),
        (radius * 0.94, height * 0.28),
        (radius * 0.92, height * 0.56),
        (radius * 0.84, height * 0.76),
        (radius * 0.88, height * 0.90),
        (radius * 0.80, height),
        (0.0, height),
    ]
    parts = [
        base.add_lathe_obj(
            "sov_plinth_core",
            pts,
            segs,
            pal["primary"],
            flute_amp=0.0 if octagonal else 0.006,
            flute_count=16,
            bevel_width=0.008 if octagonal else 0.0,
            rot_z=rot_z,
        ),
        base.add_primitive_obj(
            "sov_plinth_ring_lo",
            "torus",
            pal["gold"],
            loc=(0.0, 0.0, height * 0.28),
            rot=(0.0, 0.0, rot_z),
            r_bot=radius * 0.95,
            r_top=0.013,
            segs=24 if not octagonal else 8,
        ),
        base.add_primitive_obj(
            "sov_plinth_ring_hi",
            "torus",
            pal["gold"],
            loc=(0.0, 0.0, height * 0.90),
            rot=(0.0, 0.0, rot_z),
            r_bot=radius * 0.86,
            r_top=0.013,
            segs=24 if not octagonal else 8,
        ),
    ]
    # 8 recessed dark lancet niches + 8 gilded buttress ribs around the plinth gallery
    for i in range(8):
        ang = (i * math.pi) / 4.0 + math.pi / 8.0
        nx, ny = math.sin(ang) * radius * 0.90, -math.cos(ang) * radius * 0.90
        parts.append(
            base.add_primitive_obj(
                f"sov_plinth_niche_{i}",
                "box",
                pal["recess"],
                loc=(nx, ny, height * 0.54),
                rot=(0.0, 0.0, ang),
                size=(radius * 0.22, 0.028, height * 0.36),
            )
        )
        bang = (i * math.pi) / 4.0
        bx, by = math.sin(bang) * radius * 0.93, -math.cos(bang) * radius * 0.93
        parts.append(
            base.add_primitive_obj(
                f"sov_plinth_buttress_{i}",
                "box",
                pal["gold"],
                loc=(bx, by, height * 0.56),
                rot=(0.0, 0.0, bang),
                size=(0.024, 0.036, height * 0.52),
                bevel_width=0.004,
            )
        )
    # 4 cardinal bezel-set glowing cabochon gems
    for i in range(4):
        ang = (i * math.pi) / 2.0
        gx, gy = math.sin(ang) * radius * 0.95, -math.cos(ang) * radius * 0.95
        parts += add_gem_obj(
            f"sov_plinth_gem_{i}",
            (gx, gy, height * 0.56),
            0.018,
            pal,
            rot=(math.pi * 0.5, 0.0, ang),
            stretch_z=1.1,
        )
    return parts


def build_ornate_pavise_shield(center_world: Vector, rot_euler, width: float, height: float, pal):
    """Scalloped Gothic pavise shield with double gold rim, sunburst cross relief, and glowing central gem."""
    hw, hh = width * 0.5, height * 0.5
    pts = [
        (-hw * 0.92, hh),
        (-hw * 0.32, hh * 1.07),
        (0.0, hh * 1.02),
        (hw * 0.32, hh * 1.07),
        (hw * 0.92, hh),
        (hw, hh * 0.16),
        (hw * 0.72, -hh * 0.50),
        (0.0, -hh),
        (-hw * 0.72, -hh * 0.50),
        (-hw, hh * 0.16),
    ]
    base_rot = Euler(rot_euler, "YXZ").to_matrix().to_4x4()
    stand_mat = base_rot @ Matrix.Rotation(math.pi * 0.5, 4, "X")
    stand_euler = stand_mat.to_euler()

    parts = [
        base.add_extruded_poly_obj(
            "sov_shield_plate",
            pts,
            depth=0.030,
            mat=pal["primary"],
            bevel_width=0.009,
            loc=center_world,
            rot=stand_euler,
        ),
        base.add_extruded_poly_obj(
            "sov_shield_rim",
            [(p[0] * 1.11, p[1] * 1.08) for p in pts],
            depth=0.022,
            mat=pal["gold"],
            bevel_width=0.006,
            loc=center_world + (base_rot @ Vector((0.0, 0.006, 0.0))),
            rot=stand_euler,
        ),
    ]
    front_euler = base_rot.to_euler()
    parts.append(
        base.add_primitive_obj(
            "sov_shield_cross_v",
            "box",
            pal["gold"],
            loc=center_world + (base_rot @ Vector((0.0, -0.024, -height * 0.02))),
            rot=front_euler,
            size=(width * 0.15, 0.018, height * 0.80),
            bevel_width=0.004,
        )
    )
    parts.append(
        base.add_primitive_obj(
            "sov_shield_cross_h",
            "box",
            pal["gold"],
            loc=center_world + (base_rot @ Vector((0.0, -0.024, height * 0.12))),
            rot=front_euler,
            size=(width * 0.74, 0.018, width * 0.14),
            bevel_width=0.004,
        )
    )
    # 4 diagonal sunburst rays behind central gem
    for a in (math.pi * 0.25, -math.pi * 0.25):
        r_mat = base_rot @ Matrix.Rotation(a, 4, "Y")
        parts.append(
            base.add_primitive_obj(
                f"sov_shield_ray_{a:.2f}",
                "box",
                pal["gold"],
                loc=center_world + (base_rot @ Vector((0.0, -0.022, height * 0.12))),
                rot=r_mat.to_euler(),
                size=(width * 0.42, 0.012, width * 0.065),
                bevel_width=0.002,
            )
        )
    gem_pos = center_world + (base_rot @ Vector((0.0, -0.030, height * 0.12)))
    parts += add_gem_obj(
        "sov_shield_gem",
        gem_pos,
        width * 0.115,
        pal,
        rot=(base_rot @ Matrix.Rotation(math.pi * 0.5, 4, "X")).to_euler(),
        stretch_z=1.1,
    )
    return parts


def build_spiked_halo(center_world: Vector, radius: float, ray_count: int, pal, tilt_x: float = 0.0):
    """Radiant golden aureole halo ring behind heads (Bishop / Queen / King)."""
    rot_m = Matrix.Rotation(tilt_x, 4, "X")
    ring_euler = (rot_m @ Matrix.Rotation(math.pi * 0.5, 4, "X")).to_euler()
    parts = [
        base.add_primitive_obj(
            "halo_ring",
            "torus",
            pal["gold"],
            loc=center_world,
            rot=ring_euler,
            r_bot=radius,
            r_top=0.011,
            segs=28,
        )
    ]
    for i in range(ray_count):
        ang = (i * math.pi * 2.0) / ray_count
        is_major = i % 2 == 0
        ray_len = radius * (0.48 if is_major else 0.28)
        off_local = Vector((math.sin(ang) * (radius + ray_len * 0.42), 0.0, math.cos(ang) * (radius + ray_len * 0.42)))
        ray_rot = (rot_m @ Matrix.Rotation(-ang, 4, "Y")).to_euler()
        parts.append(
            base.add_primitive_obj(
                f"halo_ray_{i}",
                "cone",
                pal["gold"],
                loc=center_world + (rot_m @ off_local),
                rot=ray_rot,
                r_bot=0.014 if is_major else 0.009,
                height=ray_len,
                segs=6,
            )
        )
    return parts


def build_wing_parts(root_pos: Vector, side_sign: float, span: float, height: float, yaw: float, sweep: float, pal):
    """Builds a sculpted overlapping broad-feather seraphim/valkyrie wing with gilded covert crest."""
    parts = []
    wing_rot = Matrix.Rotation(yaw * side_sign, 4, "Z") @ Matrix.Rotation(sweep, 4, "X")

    def wpt(x: float, y: float, z: float) -> Vector:
        return root_pos + (wing_rot @ Vector((side_sign * x, y, z)))

    # Sculpted curved gold shoulder wing-bow
    spar_pts = [
        wpt(0.0, 0.0, 0.0),
        wpt(span * 0.34, 0.02, height * 0.36),
        wpt(span * 0.72, 0.07, height * 0.48),
        wpt(span * 1.00, 0.13, height * 0.26),
    ]
    parts.append(base.add_tube_obj(f"wing_spar_{side_sign}", spar_pts, 0.022 * (span / 0.35), pal["gold"], taper_end=True))

    # Broad overlapping sculpted blade-feathers (no toothpick gaps!)
    feather_count = 6
    for i in range(feather_count):
        t = i / (feather_count - 1)
        f_len = span * (0.96 - 0.34 * t)
        f_w = span * (0.20 - 0.05 * t)
        z_anchor = height * (0.34 - 0.50 * t)
        x_anchor = span * (0.18 + 0.08 * math.sin(t * math.pi))
        blade_pts = [
            (-f_w * 0.42, 0.0),
            (f_w * 0.42, 0.0),
            (f_w * 0.56, f_len * 0.65),
            (0.0, f_len),
            (-f_w * 0.48, f_len * 0.68),
        ]
        # Feather lies across wing span and fans cleanly downward/outward
        fan_angle = side_sign * (1.12 + t * 0.62)
        f_mat = (
            wing_rot
            @ Matrix.Rotation(fan_angle, 4, "Y")
            @ Matrix.Rotation(math.pi * 0.5, 4, "X")
        )
        parts.append(
            base.add_extruded_poly_obj(
                f"wing_feather_{side_sign}_{i}",
                blade_pts,
                depth=0.020 * (span / 0.35),
                mat=pal["gold"] if i % 2 == 0 else pal["primary"],
                bevel_width=0.004,
                loc=wpt(x_anchor, 0.02 + t * 0.03, z_anchor),
                rot=f_mat.to_euler(),
            )
        )
    return parts


def build_sculpted_visage(
    prefix: str,
    head_center: Vector,
    radius: float,
    pal,
    with_beard: bool = False,
    beard_len: float = 0.13,
):
    """Sculpts an organic subdivision-smoothed Gothic visage facing -Y (front),
    with a sleek curved Venetian brow/nasal filigree arch, smooth contoured cheek/jawline,
    subtle recessed luminous eyes, and an optional sculpted fluted ceremonial beard."""
    cx, cy, cz = head_center.x, head_center.y, head_center.z
    face_stations = [
        ((cx, cy + radius * 0.04, cz - radius * 0.94), radius * 0.56, radius * 0.52, 0.0, 0.0),
        ((cx, cy - radius * 0.05, cz - radius * 0.36), radius * 0.86, radius * 0.86, 0.0, 0.0),
        ((cx, cy - radius * 0.03, cz + radius * 0.18), radius * 0.96, radius * 0.94, 0.0, 0.0),
        ((cx, cy + radius * 0.02, cz + radius * 0.74), radius * 0.92, radius * 0.88, 0.0, 0.0),
        ((cx, cy + radius * 0.05, cz + radius * 1.04), radius * 0.44, radius * 0.44, 0.0, 0.0),
    ]
    parts = [
        add_lofted_obj(
            f"{prefix}_cranium",
            face_stations,
            segments=26,
            mat=pal["primary"],
            closed_loop=True,
            subsurf_levels=2,
        ),
        # Recessed orbital shadow visor cavity + sleek vertical nasal ridge
        base.add_primitive_obj(
            f"{prefix}_eye_recess",
            "cyl",
            pal["recess"],
            loc=(cx, cy - radius * 0.24, cz + radius * 0.16),
            scale=(1.02, 0.86, 1.0),
            r_bot=radius * 0.78,
            r_top=radius * 0.78,
            height=radius * 0.24,
            segs=20,
        ),
        base.add_tube_obj(
            f"{prefix}_nasal_arch",
            [
                (cx, cy - radius * 0.96, cz + radius * 0.34),
                (cx, cy - radius * 1.02, cz + radius * 0.08),
                (cx, cy - radius * 0.94, cz - radius * 0.18),
            ],
            radius * 0.09,
            pal["gold"],
            taper_end=True,
            resolution=8,
        ),
    ]
    for sx in (-1.0, 1.0):
        # Smooth sweeping arched golden brow filigree & subtle sapphire/ruby eyes
        parts.append(
            base.add_tube_obj(
                f"{prefix}_brow_curve_{sx}",
                [
                    (cx, cy - radius * 0.95, cz + radius * 0.26),
                    (cx + sx * radius * 0.38, cy - radius * 0.88, cz + radius * 0.34),
                    (cx + sx * radius * 0.72, cy - radius * 0.56, cz + radius * 0.22),
                ],
                radius * 0.068,
                pal["gold"],
                taper_end=True,
                resolution=8,
            )
        )
        parts.append(
            base.add_tube_obj(
                f"{prefix}_cheek_filigree_{sx}",
                [
                    (cx + sx * radius * 0.22, cy - radius * 0.90, cz - radius * 0.18),
                    (cx + sx * radius * 0.56, cy - radius * 0.72, cz - radius * 0.06),
                    (cx + sx * radius * 0.78, cy - radius * 0.38, cz + radius * 0.10),
                ],
                radius * 0.055,
                pal["gold"],
                taper_end=True,
                resolution=8,
            )
        )
        parts += add_gem_obj(
            f"{prefix}_eye_{sx}",
            (cx + sx * radius * 0.31, cy - radius * 0.89, cz + radius * 0.16),
            radius * 0.085,
            pal,
            rot=(math.pi * 0.5, 0.0, sx * 0.15),
            stretch_z=0.9,
            with_bezel=False,
        )

    if with_beard:
        beard_pts = [
            (0.0, cz - radius * 0.20 - beard_len),
            (radius * 0.16, cz - radius * 0.20 - beard_len * 0.72),
            (radius * 0.52, cz - radius * 0.20 - beard_len * 0.28),
            (radius * 0.68, cz - radius * 0.20),
            (0.0, cz - radius * 0.20),
        ]
        parts.append(
            base.add_lathe_obj(
                f"{prefix}_beard_fluted",
                beard_pts,
                22,
                pal["secondary"],
                flute_amp=0.007,
                flute_count=11,
                subsurf_levels=1,
            )
        )
        parts.append(
            base.add_tube_obj(
                f"{prefix}_beard_lock",
                [
                    (cx, cy - radius * 0.84, cz - radius * 0.22),
                    (cx, cy - radius * 0.90, cz - radius * 0.24 - beard_len * 0.52),
                    (cx, cy - radius * 0.74, cz - radius * 0.22 - beard_len * 1.02),
                ],
                radius * 0.20,
                pal["secondary"],
                taper_end=True,
                resolution=10,
            )
        )
    return parts


def build_mane_locks(pal):
    """Builds a 7-lock wind-swept flowing golden mane along the Warhorse's arched neck."""
    parts = []
    anchors = [
        ((0.0, -0.10, 0.63), (0.0, 0.04, 0.56), (0.0, 0.15, 0.51)),
        ((0.0, -0.13, 0.70), (0.04, 0.02, 0.66), (0.07, 0.16, 0.60)),
        ((0.0, -0.15, 0.77), (-0.04, 0.01, 0.74), (-0.07, 0.15, 0.69)),
        ((0.0, -0.17, 0.84), (0.05, -0.02, 0.83), (0.08, 0.12, 0.78)),
        ((0.0, -0.20, 0.90), (-0.04, -0.05, 0.91), (-0.07, 0.10, 0.88)),
        ((0.0, -0.23, 0.95), (0.0, -0.10, 1.01), (0.0, 0.05, 0.98)),
        ((0.0, -0.29, 0.97), (0.0, -0.20, 1.07), (0.0, -0.08, 1.06)),
    ]
    for i, (p0, p1, p2) in enumerate(anchors):
        parts.append(
            base.add_tube_obj(
                f"n_mane_lock_{i}",
                [p0, p1, p2],
                0.032 - i * 0.0015,
                pal["gold"],
                taper_end=True,
                resolution=10,
            )
        )
    return parts


def build_pleated_cloak(
    name: str,
    top_z: float,
    bot_z: float,
    top_rx: float,
    top_ry: float,
    bot_rx: float,
    bot_ry: float,
    y_center_top: float,
    y_center_bot: float,
    pleats: int,
    pal,
    with_gold_trim: bool = True,
):
    """Sculpts a thick billowing rear cloak covering the back (+Y) hemisphere with deep organic folds."""
    stations = []
    steps = 9
    for i in range(steps):
        t = i / (steps - 1)
        ease = t * t * (3.0 - 2.0 * t)
        flare = 1.0 + 0.10 * (t ** 2.4)
        z = top_z + (bot_z - top_z) * t
        rx = (top_rx + (bot_rx - top_rx) * ease) * flare
        ry = (top_ry + (bot_ry - top_ry) * ease) * flare
        yc = y_center_top + (y_center_bot - y_center_top) * ease
        stations.append(((0.0, yc, z), rx, ry, 0.0, 0.0))

    # Arc from +16 deg to +164 deg covers rear (+Y) shoulders cleanly without clipping front arms!
    parts = [
        add_lofted_obj(
            name,
            stations,
            segments=36,
            mat=pal["velvet"],
            arc_start=math.radians(16.0),
            arc_span=math.radians(148.0),
            closed_loop=False,
            pleat_amp=0.019,
            pleat_count=pleats,
            thickness=0.025,
            subsurf_levels=2,
        )
    ]
    if with_gold_trim:
        # Gold collar clasp & lower flared hem arch
        hem_pts = []
        flare_bot = 1.10
        for i in range(17):
            u = i / 16.0
            ang = math.radians(18.0 + u * 144.0)
            hem_pts.append((math.cos(ang) * bot_rx * flare_bot, y_center_bot + math.sin(ang) * bot_ry * flare_bot, bot_z + 0.015))
        parts.append(base.add_tube_obj(f"{name}_hem_gold", hem_pts, 0.013, pal["gold"], resolution=10))
    return parts


# ---------------------------------------------------------------------------
# 6 Collector-Grade Sovereign Reliquary Piece Builders
# ---------------------------------------------------------------------------

def build_sovereign_pawn(pal) -> bpy.types.Object:
    root = base.make_empty("Piece_p")
    base.bake_parts_into_joint_mesh("Plinth_p", build_reliquary_plinth(0.32, 0.145, pal), Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.135))
    pivot_body = base.make_empty("Pivot_Body_p", body_pivot_w, root)

    body_parts = [
        base.add_lathe_obj(
            "p_skirt",
            [(0.0, 0.135), (0.252, 0.135), (0.232, 0.25), (0.180, 0.39), (0.0, 0.39)],
            28,
            pal["secondary"],
            flute_amp=0.010,
            flute_count=10,
            subsurf_levels=1,
        ),
        base.add_primitive_obj("p_belt", "cyl", pal["gold"], loc=(0.0, 0.0, 0.39), r_bot=0.192, r_top=0.185, height=0.052, segs=24, bevel_width=0.006),
        base.add_lathe_obj(
            "p_cuirass",
            [(0.0, 0.39), (0.172, 0.40), (0.214, 0.55), (0.192, 0.65), (0.120, 0.68), (0.0, 0.68)],
            28,
            pal["primary"],
            scale_xyz=(1.06, 0.90, 1.0),
            subsurf_levels=1,
        ),
        base.add_primitive_obj("p_sternum", "box", pal["gold"], loc=(0.0, -0.186, 0.53), rot=(-0.14, 0.0, 0.0), size=(0.040, 0.032, 0.23), bevel_width=0.006),
        base.add_primitive_obj("p_gorget", "cyl", pal["gold"], loc=(0.0, 0.0, 0.67), r_bot=0.144, r_top=0.122, height=0.058, segs=20, bevel_width=0.006),
        # Rear dorsal spine clasp (+Y) so player's perspective gleams
        base.add_primitive_obj("p_back_clasp", "octa", pal["gold"], loc=(0.0, 0.195, 0.58), scale=(1.1, 0.5, 1.4), radius=0.055),
    ]
    body_parts += add_gem_obj("p_chest_gem", (0.0, -0.198, 0.56), 0.024, pal, rot=(math.pi * 0.5, 0.0, 0.0))
    body_parts += build_pleated_cloak("p_cape", 0.64, 0.20, 0.175, 0.165, 0.245, 0.225, 0.04, 0.06, 7, pal)
    for i in range(4):
        ang = (i * math.pi) / 2.0 + math.pi / 4.0
        body_parts.append(
            base.add_primitive_obj(
                f"p_tasset_{i}",
                "box",
                pal["primary"],
                loc=(math.sin(ang) * 0.178, -math.cos(ang) * 0.178, 0.29),
                rot=(0.22, 0.0, ang),
                size=(0.142, 0.042, 0.175),
                bevel_width=0.008,
            )
        )
    base.bake_parts_into_joint_mesh("Mesh_Body_p", body_parts, body_pivot_w, pivot_body)

    # Head + Visored Sallet Kettle Helm + Sweeping Bladed Crest + Sculpted Visage
    head_pivot_w = Vector((0.0, 0.0, 0.67))
    pivot_head = base.make_empty("Pivot_Head_p", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = build_sculpted_visage("p", Vector((0.0, 0.0, 0.77)), 0.104, pal, with_beard=False) + [
        base.add_primitive_obj("p_chin", "cyl", pal["primary"], loc=(0.0, 0.0, 0.715), r_bot=0.112, r_top=0.098, height=0.072, segs=16, bevel_width=0.006),
        base.add_lathe_obj(
            "p_kettle_helm",
            [(0.238, 0.81), (0.214, 0.84), (0.150, 0.88), (0.132, 0.96), (0.088, 1.03), (0.022, 1.07), (0.0, 1.075)],
            28,
            pal["primary"],
            subsurf_levels=1,
        ),
        base.add_primitive_obj("p_kettle_rim", "torus", pal["gold"], loc=(0.0, 0.0, 0.818), r_bot=0.228, r_top=0.014, segs=28),
        base.add_tube_obj(
            "p_kettle_crest",
            [(0.0, -0.145, 0.92), (0.0, -0.095, 1.035), (0.0, 0.0, 1.085), (0.0, 0.11, 1.045), (0.0, 0.21, 0.94)],
            0.019,
            pal["gold"],
            taper_end=True,
        ),
        base.add_primitive_obj("p_finial", "cone", pal["gold"], loc=(0.0, 0.0, 1.095), r_bot=0.028, height=0.068, segs=8),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_p", head_parts, head_pivot_w, pivot_head)

    # ShieldArm (+X)
    shield_pivot_w = Vector((0.21, -0.01, 0.61))
    pivot_shield = base.make_empty("Pivot_ShieldArm_p", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.03, -0.17, -0.11))
    shield_parts = base.build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 0.94, pal)
    shield_parts += build_ornate_pavise_shield(
        shield_pivot_w + shield_hand_local + Vector((0.035, -0.035, 0.02)),
        (0.08, 0.0, 0.45),
        0.26,
        0.34,
        pal,
    )
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_p", shield_parts, shield_pivot_w, pivot_shield)

    # WeaponArm (-X)
    weapon_pivot_w = Vector((-0.21, -0.01, 0.61))
    pivot_weapon = base.make_empty("Pivot_WeaponArm_p", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.02, -0.18, -0.10))
    weapon_parts = base.build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 0.94, pal)
    weapon_parts += base.build_sword_parts(
        weapon_pivot_w + weapon_hand_local,
        0.50,
        0.062,
        0.185,
        0.12,
        point_down=False,
        pal=pal,
        tilt_x=0.12,
    )
    weapon_parts += add_gem_obj("p_pommel_gem", weapon_pivot_w + weapon_hand_local + Vector((0.0, 0.01, -0.06)), 0.018, pal)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_p", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_sovereign_rook(pal) -> bpy.types.Object:
    root = base.make_empty("Piece_r")
    base.bake_parts_into_joint_mesh("Plinth_r", build_reliquary_plinth(0.365, 0.16, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.15))
    pivot_body = base.make_empty("Pivot_Body_r", body_pivot_w, root)
    body_parts = [
        base.add_lathe_obj(
            "r_shaft",
            [(0.0, 0.15), (0.305, 0.15), (0.280, 0.32), (0.245, 0.58), (0.262, 0.83), (0.0, 0.83)],
            8,
            pal["primary"],
            bevel_width=0.012,
            rot_z=math.pi / 8.0,
        ),
        base.add_primitive_obj("r_belt", "cyl", pal["gold"], loc=(0.0, 0.0, 0.41), rot=(0.0, 0.0, math.pi / 8.0), r_bot=0.292, r_top=0.282, height=0.052, segs=8, bevel_width=0.006),
        base.add_primitive_obj("r_neck_gold", "cyl", pal["gold"], loc=(0.0, 0.0, 0.81), rot=(0.0, 0.0, math.pi / 8.0), r_bot=0.270, r_top=0.278, height=0.044, segs=8, bevel_width=0.006),
    ]
    # Dual front (-Y) and rear (+Y) portcullis gates so player view has full architectural richness
    for dir_y in (-1.0, 1.0):
        body_parts.append(base.add_primitive_obj(f"r_gate_recess_{dir_y}", "box", pal["recess"], loc=(0.0, dir_y * 0.265, 0.26), size=(0.148, 0.040, 0.225)))
        body_parts.append(base.add_primitive_obj(f"r_gate_arch_{dir_y}", "box", pal["gold"], loc=(0.0, dir_y * 0.268, 0.378), size=(0.180, 0.048, 0.036), bevel_width=0.006))
        for bx in (-0.044, 0.0, 0.044):
            body_parts.append(base.add_primitive_obj(f"r_gate_bar_{dir_y}_{bx}", "cyl", pal["gold"], loc=(bx, dir_y * 0.276, 0.26), r_bot=0.009, r_top=0.009, height=0.205, segs=8))
    # 8 Heavy gilded corner buttresses + 4 glowing arcane lancet windows
    for i in range(8):
        ang = (i * math.pi) / 4.0 + math.pi / 8.0
        body_parts.append(
            base.add_primitive_obj(
                f"r_rib_{i}",
                "box",
                pal["secondary"],
                loc=(math.sin(ang) * 0.258, -math.cos(ang) * 0.258, 0.48),
                rot=(0.0, 0.0, ang),
                size=(0.062, 0.072, 0.64),
                bevel_width=0.008,
            )
        )
    for i in range(4):
        ang = (i * math.pi) / 2.0
        sx, sy = math.sin(ang) * 0.238, -math.cos(ang) * 0.238
        body_parts.append(base.add_primitive_obj(f"r_slit_v_{i}", "box", pal["recess"], loc=(sx, sy, 0.64), rot=(0.0, 0.0, ang), size=(0.046, 0.038, 0.21)))
        body_parts += add_gem_obj(f"r_window_gem_{i}", (math.sin(ang) * 0.252, -math.cos(ang) * 0.252, 0.64), 0.022, pal, rot=(math.pi * 0.5, 0.0, ang), stretch_z=1.5, with_bezel=False)
    base.bake_parts_into_joint_mesh("Mesh_Body_r", body_parts, body_pivot_w, pivot_body)

    # WeaponArm: Upper Machicolated Battlement Crown + 4 Winged Gargoyle Prows + Arcane Crystal Spire
    weapon_pivot_w = Vector((0.0, 0.0, 0.83))
    pivot_weapon = base.make_empty("Pivot_WeaponArm_r", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_parts = [
        base.add_lathe_obj(
            "r_corbel",
            [(0.0, 0.83), (0.262, 0.83), (0.335, 0.97), (0.342, 1.13), (0.235, 1.13), (0.222, 1.05), (0.0, 1.05)],
            8,
            pal["primary"],
            bevel_width=0.010,
            rot_z=math.pi / 8.0,
        ),
        base.add_primitive_obj("r_crown_band", "cyl", pal["gold"], loc=(0.0, 0.0, 0.985), rot=(0.0, 0.0, math.pi / 8.0), r_bot=0.338, r_top=0.346, height=0.044, segs=8, bevel_width=0.006),
        base.add_primitive_obj("r_rampart", "cyl", pal["recess"], loc=(0.0, 0.0, 1.06), rot=(0.0, 0.0, math.pi / 8.0), r_bot=0.226, r_top=0.226, height=0.024, segs=8),
        # Central Siege Spire cradling a levitating glowing crystal
        base.add_primitive_obj("r_spire_base", "cyl", pal["gold"], loc=(0.0, 0.0, 1.12), r_bot=0.095, r_top=0.045, height=0.11, segs=8, bevel_width=0.005),
    ]
    weapon_parts += add_gem_obj("r_core_crystal", (0.0, 0.0, 1.255), 0.068, pal, stretch_z=1.55, with_bezel=False)
    for i in range(4):
        ang = (i * math.pi) / 2.0 + math.pi / 4.0
        # 4 sculpted winged gargoyle / dragon-prow corbels around the battlements
        gx, gy = math.sin(ang) * 0.34, -math.cos(ang) * 0.34
        weapon_parts.append(
            base.add_primitive_obj(
                f"r_gargoyle_prow_{i}",
                "cone",
                pal["gold"],
                loc=(gx, gy, 1.02),
                rot=(math.pi * 0.42, 0.0, ang),
                r_bot=0.052,
                height=0.16,
                segs=6,
                bevel_width=0.006,
            )
        )
        # 4 claw prongs reaching toward the floating crystal
        cx, cy = math.sin(ang) * 0.095, -math.cos(ang) * 0.095
        weapon_parts.append(
            base.add_tube_obj(
                f"r_claw_{i}",
                [(cx * 1.15, cy * 1.15, 1.15), (cx * 0.9, cy * 0.9, 1.25), (cx * 0.42, cy * 0.42, 1.33)],
                0.013,
                pal["gold"],
                taper_end=True,
            )
        )
    for i in range(8):
        ang = (i * math.pi) / 4.0
        mx, my = math.sin(ang) * 0.285, -math.cos(ang) * 0.285
        weapon_parts.append(base.add_primitive_obj(f"r_merlon_{i}", "box", pal["primary"], loc=(mx, my, 1.20), rot=(0.0, 0.0, ang), size=(0.128, 0.088, 0.155), bevel_width=0.009))
        weapon_parts.append(base.add_primitive_obj(f"r_merlon_cap_{i}", "box", pal["gold"], loc=(mx, my, 1.285), rot=(0.0, 0.0, ang), size=(0.142, 0.098, 0.030), bevel_width=0.006))
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_r", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_sovereign_knight(pal) -> bpy.types.Object:
    root = base.make_empty("Piece_n")
    base.bake_parts_into_joint_mesh("Plinth_n", build_reliquary_plinth(0.365, 0.15, pal), Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.14))
    pivot_body = base.make_empty("Pivot_Body_n", body_pivot_w, root)

    # Anatomical High-Poly Subdivision-Smoothed Muscular Warhorse Body, Arched Neck & Tapered Muzzle
    horse_stations = [
        ((0.0, 0.25, 0.36), 0.132, 0.118, -0.42, 0.0),
        ((0.0, 0.14, 0.43), 0.146, 0.136, -0.18, 0.0),
        ((0.0, -0.04, 0.47), 0.152, 0.148, 0.08, 0.0),
        ((0.0, -0.17, 0.54), 0.142, 0.152, 0.44, 0.0),
        ((0.0, -0.23, 0.70), 0.108, 0.132, 0.74, 0.0),
        ((0.0, -0.22, 0.86), 0.084, 0.106, 0.98, 0.0),
        ((0.0, -0.29, 0.94), 0.072, 0.086, 1.32, 0.0),
        ((0.0, -0.37, 0.89), 0.056, 0.068, 1.56, 0.0),
        ((0.0, -0.45, 0.81), 0.036, 0.044, 1.72, 0.0),
    ]
    body_parts = [
        add_lofted_obj("n_horse_loft", horse_stations, 28, pal["primary"], closed_loop=True, subsurf_levels=2),
        # Lower Jaw, Cheekbone Crest, Ears & Nostrils
        base.add_primitive_obj("n_jaw", "box", pal["secondary"], loc=(0.0, -0.38, 0.82), rot=(-0.78, 0.0, 0.0), size=(0.072, 0.046, 0.14), bevel_width=0.012),
        base.add_primitive_obj("n_chamfron", "box", pal["gold"], loc=(0.0, -0.365, 0.895), rot=(-0.64, 0.0, 0.0), size=(0.108, 0.046, 0.21), bevel_width=0.008),
        base.add_primitive_obj("n_chamfron_horn", "cone", pal["gold"], loc=(0.0, -0.40, 1.00), rot=(0.75, 0.0, 0.0), r_bot=0.024, height=0.145, segs=10),
        base.add_primitive_obj("n_peytral", "sphere", pal["gold"], loc=(0.0, -0.26, 0.52), scale=(1.02, 0.62, 0.94), radius=0.152, segs=22),
        # Armored Crusader Saddle + High Cantle + Rider Torso
        base.add_primitive_obj("n_saddle", "box", pal["gold"], loc=(0.0, 0.05, 0.63), size=(0.255, 0.255, 0.084), bevel_width=0.012),
        base.add_primitive_obj("n_cantle", "box", pal["gold"], loc=(0.0, 0.16, 0.72), rot=(0.24, 0.0, 0.0), size=(0.23, 0.045, 0.14), bevel_width=0.008),
        base.add_primitive_obj("n_rider_torso", "cyl", pal["primary"], loc=(0.0, 0.05, 0.84), scale=(1.15, 0.88, 1.0), r_bot=0.122, r_top=0.136, height=0.33, segs=18, bevel_width=0.010),
        base.add_primitive_obj("n_rider_belt", "cyl", pal["gold"], loc=(0.0, 0.05, 0.73), scale=(1.15, 0.88, 1.0), r_bot=0.135, r_top=0.135, height=0.044, segs=18, bevel_width=0.005),
    ]
    body_parts += build_mane_locks(pal)
    for sx in (-1.0, 1.0):
        body_parts.append(base.add_primitive_obj(f"n_ear_{sx}", "cone", pal["primary"], loc=(sx * 0.052, -0.26, 1.005), rot=(0.45, sx * -0.28, 0.0), r_bot=0.022, height=0.075, segs=8))
        body_parts.append(base.add_primitive_obj(f"n_nostril_{sx}", "sphere", pal["recess"], loc=(sx * 0.028, -0.455, 0.805), radius=0.016, segs=8))
        body_parts += add_gem_obj(f"n_horse_eye_{sx}", (sx * 0.058, -0.355, 0.905), 0.014, pal, rot=(0.2, sx * 0.4, 0.0), with_bezel=False)
        body_parts.append(base.add_tube_obj(f"n_tail_braid_{sx}", [(0.0, 0.29, 0.49), (sx * 0.045, 0.39, 0.41), (sx * 0.025, 0.36, 0.23)], 0.022, pal["velvet"], taper_end=True))
    body_parts.append(base.add_tube_obj("n_tail_core", [(0.0, 0.30, 0.50), (0.0, 0.41, 0.42), (0.0, 0.38, 0.21)], 0.032, pal["gold"], taper_end=True))
    body_parts += add_gem_obj("n_peytral_gem", (0.0, -0.35, 0.53), 0.028, pal, rot=(math.pi * 0.5, 0.0, 0.0))
    body_parts += build_pleated_cloak("n_rider_cloak", 0.94, 0.56, 0.135, 0.12, 0.195, 0.18, 0.07, 0.14, 5, pal)
    # 4 Articulated Legs (forelegs rearing slightly forward!) + Flank Scale Barding
    for lx, ly, is_front in ((-0.092, -0.17, True), (0.092, -0.17, True), (-0.098, 0.19, False), (0.098, 0.19, False)):
        rot_x = 0.26 if is_front else -0.12
        z_leg = 0.29 if is_front else 0.27
        body_parts.append(base.add_primitive_obj("n_leg", "cyl", pal["secondary"], loc=(lx, ly, z_leg), rot=(rot_x, 0.0, 0.0), r_bot=0.033, r_top=0.044, height=0.28, segs=12))
        body_parts.append(base.add_primitive_obj("n_hoof", "cyl", pal["gold"], loc=(lx, ly + (-0.045 if is_front else 0.025), 0.175 if is_front else 0.16), rot=(rot_x, 0.0, 0.0), r_bot=0.046, r_top=0.038, height=0.046, segs=12))
    for sx in (-1.0, 1.0):
        body_parts.append(base.add_primitive_obj("n_flank", "box", pal["velvet"], loc=(sx * 0.145, 0.02, 0.44), rot=(0.0, sx * 0.08, 0.0), size=(0.034, 0.44, 0.25), bevel_width=0.007))
        body_parts.append(base.add_primitive_obj("n_flank_trim", "box", pal["gold"], loc=(sx * 0.155, 0.02, 0.325), size=(0.038, 0.45, 0.032), bevel_width=0.005))
        body_parts.append(base.add_primitive_obj("n_greave", "cyl", pal["secondary"], loc=(sx * 0.160, 0.02, 0.58), rot=(0.22, sx * -0.16, 0.0), r_bot=0.036, r_top=0.044, height=0.25, segs=10))
    base.bake_parts_into_joint_mesh("Mesh_Body_n", body_parts, body_pivot_w, pivot_body)

    # Head: Winged Valkyrie/Crusader Great Helm
    head_pivot_w = Vector((0.0, 0.05, 1.00))
    pivot_head = base.make_empty("Pivot_Head_n", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = [
        base.add_primitive_obj("n_helm", "cyl", pal["primary"], loc=(0.0, 0.05, 1.15), r_bot=0.125, r_top=0.116, height=0.28, segs=18, bevel_width=0.010),
        base.add_primitive_obj("n_helm_top", "cyl", pal["gold"], loc=(0.0, 0.05, 1.295), r_bot=0.116, r_top=0.095, height=0.034, segs=18, bevel_width=0.006),
        base.add_primitive_obj("n_visor_slit", "box", pal["recess"], loc=(0.0, -0.060, 1.185), size=(0.145, 0.044, 0.028)),
        base.add_primitive_obj("n_cross_v", "box", pal["gold"], loc=(0.0, -0.072, 1.155), size=(0.026, 0.024, 0.215), bevel_width=0.004),
        base.add_primitive_obj("n_cross_h", "box", pal["gold"], loc=(0.0, -0.072, 1.160), size=(0.150, 0.024, 0.024), bevel_width=0.004),
        base.add_tube_obj("n_plume", [(0.0, 0.01, 1.31), (0.0, 0.09, 1.43), (0.0, 0.22, 1.37)], 0.032, pal["velvet"], taper_end=True),
    ]
    for sx in (-1.0, 1.0):
        head_parts += build_wing_parts(Vector((sx * 0.115, 0.06, 1.22)), sx, 0.20, 0.18, 0.45, -0.15, pal)
    base.bake_parts_into_joint_mesh("Mesh_Head_n", head_parts, head_pivot_w, pivot_head)

    # ShieldArm (+X)
    shield_pivot_w = Vector((0.19, 0.04, 0.96))
    pivot_shield = base.make_empty("Pivot_ShieldArm_n", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.02, -0.16, -0.10))
    shield_parts = base.build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 0.92, pal)
    shield_parts += build_ornate_pavise_shield(shield_pivot_w + shield_hand_local + Vector((0.035, -0.03, 0.01)), (0.08, 0.0, 0.55), 0.25, 0.33, pal)
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_n", shield_parts, shield_pivot_w, pivot_shield)

    # WeaponArm (-X): Spiraled Jousting War-Lance + Glowing Pennon Collar
    weapon_pivot_w = Vector((-0.19, 0.04, 0.96))
    pivot_weapon = base.make_empty("Pivot_WeaponArm_n", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.01, -0.17, -0.10))
    lance_grip_w = weapon_pivot_w + weapon_hand_local
    lance_tilt = 0.30
    rot_m = Matrix.Rotation(lance_tilt, 4, "X")

    def lpt(z_off: float) -> Vector:
        return lance_grip_w + (rot_m @ Vector((0.0, 0.0, z_off)))

    weapon_parts = base.build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 0.92, pal)
    weapon_parts += [
        base.add_primitive_obj("n_lance_shaft", "cyl", pal["leather"], loc=lpt(0.14), rot=(lance_tilt, 0.0, 0.0), r_bot=0.024, r_top=0.018, height=0.76, segs=12),
        base.add_primitive_obj("n_vamplate", "cone", pal["gold"], loc=lpt(0.08), rot=(lance_tilt, 0.0, 0.0), r_bot=0.090, height=0.120, segs=18, bevel_width=0.005),
        base.add_primitive_obj("n_lance_collar", "cyl", pal["gold"], loc=lpt(0.49), rot=(lance_tilt, 0.0, 0.0), r_bot=0.030, r_top=0.030, height=0.040, segs=12),
        base.add_diamond_blade_obj("n_lance_tip", length=0.25, base_half_w=0.038, shoulder_half_w=0.022, ridge=0.026, mat=pal["steel"], loc=lpt(0.51), rot=(lance_tilt, 0.0, 0.0)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_n", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_sovereign_bishop(pal) -> bpy.types.Object:
    root = base.make_empty("Piece_b")
    base.bake_parts_into_joint_mesh("Plinth_b", build_reliquary_plinth(0.355, 0.15, pal), Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.14))
    pivot_body = base.make_empty("Pivot_Body_b", body_pivot_w, root)

    body_parts = [
        base.add_lathe_obj(
            "b_robe",
            [(0.0, 0.14), (0.270, 0.14), (0.246, 0.34), (0.190, 0.72), (0.205, 0.94), (0.145, 1.04), (0.0, 1.04)],
            32,
            pal["primary"],
            flute_amp=0.013,
            flute_count=12,
            subsurf_levels=1,
        ),
        base.add_primitive_obj("b_stole_f", "box", pal["velvet"], loc=(0.0, -0.228, 0.56), rot=(-0.13, 0.0, 0.0), size=(0.090, 0.030, 0.68), bevel_width=0.006),
        base.add_primitive_obj("b_stole_f_trim", "box", pal["gold"], loc=(0.0, -0.236, 0.56), rot=(-0.13, 0.0, 0.0), size=(0.030, 0.020, 0.68), bevel_width=0.003),
        base.add_primitive_obj("b_pectoral", "cyl", pal["secondary"], loc=(0.0, 0.0, 0.89), scale=(1.08, 0.86, 1.0), r_bot=0.175, r_top=0.188, height=0.23, segs=22, bevel_width=0.012),
        base.add_primitive_obj("b_collar", "torus", pal["gold"], loc=(0.0, 0.0, 1.01), r_bot=0.152, r_top=0.018, segs=24),
        # High Curved Cathedral Mantle Collar wrapping cleanly around rear shoulders (+Y)
        add_lofted_obj(
            "b_cathedral_collar",
            [
                ((0.0, 0.02, 1.00), 0.175, 0.165, 0.0, 0.0),
                ((0.0, 0.05, 1.12), 0.205, 0.185, 0.0, 0.0),
                ((0.0, 0.09, 1.22), 0.190, 0.165, 0.0, 0.0),
            ],
            segments=18,
            mat=pal["velvet"],
            arc_start=math.radians(24.0),
            arc_span=math.radians(132.0),
            closed_loop=False,
            pleat_amp=0.006,
            pleat_count=4,
            thickness=0.022,
            subsurf_levels=1,
        ),
        base.add_tube_obj(
            "b_cathedral_collar_rim",
            [
                (-0.175, 0.125, 1.19),
                (-0.10, 0.215, 1.23),
                (0.0, 0.255, 1.26),
                (0.10, 0.215, 1.23),
                (0.175, 0.125, 1.19),
            ],
            0.013,
            pal["gold"],
        ),
    ]
    body_parts += add_gem_obj("b_pectoral_gem", (0.0, -0.195, 0.88), 0.028, pal, rot=(math.pi * 0.5, 0.0, 0.0))
    for ang in (-0.42, 0.42):
        body_parts.append(base.add_tube_obj(f"b_filigree_arch_{ang}", [(math.sin(ang) * 0.26, -math.cos(ang) * 0.26, 0.20), (math.sin(ang) * 0.21, -math.cos(ang) * 0.21, 0.56), (math.sin(ang * 0.6) * 0.18, -math.cos(ang * 0.6) * 0.18, 0.92)], 0.011, pal["gold"]))
    body_parts += build_pleated_cloak("b_mantle", 0.99, 0.24, 0.195, 0.18, 0.265, 0.25, 0.04, 0.07, 9, pal)
    base.bake_parts_into_joint_mesh("Mesh_Body_b", body_parts, body_pivot_w, pivot_body)

    # Head: Hierophant + Sculpted Visage & Fluted Beard + Cleft Mitre + Rear Lappets + Radiant Halo
    head_pivot_w = Vector((0.0, 0.0, 1.04))
    pivot_head = base.make_empty("Pivot_Head_b", head_pivot_w - body_pivot_w, pivot_body)
    mitre_pts = [(-0.118, 0.16), (0.118, 0.16), (0.132, 0.31), (0.070, 0.51), (0.0, 0.35), (-0.070, 0.51), (-0.132, 0.31)]
    head_parts = build_sculpted_visage("b", Vector((0.0, 0.0, 1.145)), 0.105, pal, with_beard=True, beard_len=0.125) + [
        base.add_extruded_poly_obj("b_mitre", mitre_pts, depth=0.175, mat=pal["primary"], bevel_width=0.022, subsurf_levels=1, loc=(0.0, 0.0, 1.04), rot=(math.pi * 0.5, 0.0, -math.pi * 0.5)),
        base.add_primitive_obj("b_mitre_band", "cyl", pal["gold"], loc=(0.0, 0.0, 1.215), r_bot=0.130, r_top=0.132, height=0.034, segs=22, bevel_width=0.005),
    ]
    # Twin rear gold-trimmed lappets (infulae) hanging from back of mitre
    for sx in (-0.045, 0.045):
        head_parts.append(base.add_tube_obj(f"b_lappet_{sx}", [(sx, 0.12, 1.19), (sx * 1.2, 0.18, 1.06), (sx * 1.3, 0.21, 0.94)], 0.015, pal["gold"], taper_end=True))
    head_parts += base.build_latin_cross_parts(Vector((0.0, -0.145, 1.30)), 0.15, 0.10, 0.022, pal, tilt_x=0.18)
    head_parts += build_spiked_halo(Vector((0.0, 0.125, 1.35)), 0.175, 12, pal, tilt_x=0.08)
    base.bake_parts_into_joint_mesh("Mesh_Head_b", head_parts, head_pivot_w, pivot_head)

    # ShieldArm (+X) cradling Open Illuminated Grimoire with glowing sigil gem
    shield_pivot_w = Vector((0.225, -0.02, 0.97))
    pivot_shield = base.make_empty("Pivot_ShieldArm_b", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.03, -0.19, -0.11))
    shield_parts = base.build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 1.0, pal)

    tome_center = shield_pivot_w + shield_hand_local + Vector((0.02, -0.06, 0.04))
    tome_rot = Euler((-0.62, 0.10, -0.25), "XYZ").to_matrix().to_4x4()
    for sx in (-1.0, 1.0):
        wing_m = tome_rot @ Matrix.Rotation(sx * 0.38, 4, "Z")
        shield_parts.append(base.add_primitive_obj("b_tome_cover", "box", pal["velvet"], loc=tome_center + (wing_m @ Vector((sx * 0.064, 0.0, 0.0))), rot=wing_m.to_euler(), size=(0.14, 0.016, 0.19), bevel_width=0.004))
        shield_parts.append(base.add_primitive_obj("b_tome_page", "box", pal["parchment"], loc=tome_center + (wing_m @ Vector((sx * 0.064, -0.016, 0.0))), rot=wing_m.to_euler(), size=(0.124, 0.022, 0.17), bevel_width=0.003))
    shield_parts.append(base.add_primitive_obj("b_tome_spine", "cyl", pal["gold"], loc=tome_center, rot=tome_rot.to_euler(), r_bot=0.016, r_top=0.016, height=0.195, segs=10))
    shield_parts += add_gem_obj("b_tome_gem", tome_center + (tome_rot @ Vector((0.0, -0.025, 0.0))), 0.022, pal)
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_b", shield_parts, shield_pivot_w, pivot_shield)

    # WeaponArm (-X) gripping Spiral Arch-Crosier cradling floating crystal
    weapon_pivot_w = Vector((-0.225, -0.02, 0.97))
    pivot_weapon = base.make_empty("Pivot_WeaponArm_b", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.02, -0.19, -0.10))
    c_grip = weapon_pivot_w + weapon_hand_local
    c_rot = Matrix.Rotation(0.06, 4, "X")

    def cpt(y_off: float, z_off: float) -> Vector:
        return c_grip + (c_rot @ Vector((0.0, y_off, z_off)))

    crook_pts = [cpt(0.0, 0.37)]
    steps = 28
    for i in range(steps + 1):
        t = i / steps
        ang = -math.pi * 0.5 + t * math.pi * 2.0 * 1.25
        rad = 0.152 * (1.0 - t * 0.62)
        radial = -(0.04 + math.cos(ang) * rad)
        crook_pts.append(cpt(radial * 0.85, 0.54 + math.sin(ang) * rad))
        crook_pts[-1].x += radial * 0.52

    weapon_parts = base.build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 1.0, pal)
    weapon_parts += [
        base.add_primitive_obj("b_staff", "cyl", pal["leather"], loc=cpt(0.0, -0.14), rot=(0.06, 0.0, 0.0), r_bot=0.020, r_top=0.020, height=0.96, segs=12),
        base.add_primitive_obj("b_ferrule", "cyl", pal["gold"], loc=cpt(0.0, -0.62), rot=(0.06, 0.0, 0.0), r_bot=0.012, r_top=0.028, height=0.096, segs=12),
        base.add_primitive_obj("b_lantern", "cyl", pal["gold"], loc=cpt(0.0, 0.36), rot=(0.06, 0.0, 0.0), r_bot=0.032, r_top=0.042, height=0.072, segs=8, bevel_width=0.005),
        base.add_tube_obj("b_crook", crook_pts, 0.024, pal["gold"], resolution=10, bevel_res=6),
    ]
    weapon_parts += add_gem_obj("b_crook_gem", cpt(-0.07, 0.54) + Vector((-0.04, 0.0, 0.0)), 0.030, pal, with_bezel=False)
    weapon_parts += base.build_latin_cross_parts(cpt(-0.035, 0.49) + Vector((-0.02, 0.0, 0.0)), 0.09, 0.065, 0.016, pal, tilt_x=0.06)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_b", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_sovereign_queen(pal) -> bpy.types.Object:
    root = base.make_empty("Piece_q")
    base.bake_parts_into_joint_mesh("Plinth_q", build_reliquary_plinth(0.365, 0.16, pal), Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.15))
    pivot_body = base.make_empty("Pivot_Body_q", body_pivot_w, root)

    body_parts = [
        base.add_lathe_obj(
            "q_gown",
            [(0.0, 0.15), (0.295, 0.15), (0.268, 0.36), (0.188, 0.72), (0.160, 0.88), (0.214, 1.08), (0.182, 1.16), (0.120, 1.19), (0.0, 1.19)],
            40,
            pal["primary"],
            flute_amp=0.014,
            flute_count=16,
            scale_xyz=(1.04, 0.94, 1.0),
            subsurf_levels=1,
        ),
        base.add_primitive_obj("q_hem_ring", "torus", pal["gold"], loc=(0.0, 0.0, 0.19), scale=(1.04, 0.94, 1.0), r_bot=0.285, r_top=0.015, segs=28),
        base.add_primitive_obj("q_girdle", "cyl", pal["gold"], loc=(0.0, 0.0, 0.88), r_bot=0.174, r_top=0.170, height=0.056, segs=24, bevel_width=0.006),
    ]
    body_parts += add_gem_obj("q_chest_gem", (0.0, -0.188, 1.04), 0.036, pal, rot=(math.pi * 0.5, 0.0, 0.0))
    for ang in (-0.38, 0.38):
        body_parts.append(base.add_tube_obj(f"q_corset_filigree_{ang}", [(math.sin(ang) * 0.295, -math.cos(ang) * 0.272, 0.22), (math.sin(ang) * 0.230, -math.cos(ang) * 0.210, 0.55), (math.sin(ang) * 0.174, -math.cos(ang) * 0.158, 0.88), (math.sin(ang * 0.5) * 0.222, -math.cos(ang * 0.5) * 0.204, 1.06)], 0.011, pal["gold"]))
    body_parts += build_pleated_cloak("q_train", 1.12, 0.20, 0.19, 0.17, 0.29, 0.27, 0.05, 0.09, 10, pal)
    # 4 Sculpted Golden Valkyrie Seraphim Wings fanning cleanly from rear back (+Y)
    for sx in (-1.0, 1.0):
        body_parts += build_wing_parts(Vector((sx * 0.13, 0.15, 1.08)), sx, 0.34, 0.28, 0.45, -0.14, pal)
        body_parts += build_wing_parts(Vector((sx * 0.11, 0.17, 0.88)), sx, 0.24, 0.20, 0.55, -0.06, pal)
    base.bake_parts_into_joint_mesh("Mesh_Body_q", body_parts, body_pivot_w, pivot_body)

    # Head: Valkyrie Empress + Sculpted Visage + 12-Spire Lily Crown + Sunburst Aureole
    head_pivot_w = Vector((0.0, 0.0, 1.19))
    pivot_head = base.make_empty("Pivot_Head_q", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = build_sculpted_visage("q", Vector((0.0, 0.0, 1.295)), 0.106, pal, with_beard=False) + [
        base.add_primitive_obj("q_veil", "cyl", pal["velvet"], loc=(0.0, 0.092, 1.23), rot=(0.12, 0.0, 0.0), scale=(0.95, 0.45, 1.0), r_bot=0.142, r_top=0.104, height=0.25, segs=16, bevel_width=0.010),
        base.add_primitive_obj("q_circlet", "cyl", pal["gold"], loc=(0.0, 0.0, 1.375), r_bot=0.116, r_top=0.132, height=0.058, segs=24, bevel_width=0.006),
        base.add_primitive_obj("q_coronet_cap", "sphere", pal["primary"], loc=(0.0, 0.0, 1.395), radius=0.104, segs=16),
        base.add_primitive_obj("q_apex_stem", "cyl", pal["gold"], loc=(0.0, 0.0, 1.54), r_bot=0.034, r_top=0.016, height=0.16, segs=10),
    ]
    head_parts += add_gem_obj("q_apex_gem", (0.0, 0.0, 1.665), 0.044, pal, stretch_z=1.5, with_bezel=False)
    for i in range(12):
        ang = (i * math.pi) / 6.0
        is_major = i % 2 == 0
        sp_h = 0.25 if is_major else 0.16
        base_pt = Vector((math.sin(ang) * 0.118, -math.cos(ang) * 0.118, 1.40))
        rot_m = Matrix.Rotation(ang, 4, "Z") @ Matrix.Rotation(0.20, 4, "X")
        head_parts.append(base.add_primitive_obj(f"q_spike_{i}", "cone", pal["gold"], loc=base_pt + (rot_m @ Vector((0.0, 0.0, sp_h * 0.5))), rot=rot_m.to_euler(), r_bot=0.022 if is_major else 0.015, height=sp_h, segs=8))
        tip_loc = base_pt + (rot_m @ Vector((0.0, 0.0, sp_h + 0.015)))
        if is_major:
            head_parts += add_gem_obj(f"q_crown_gem_{i}", tip_loc, 0.020, pal, with_bezel=False)
        else:
            head_parts.append(base.add_primitive_obj(f"q_pearl_{i}", "sphere", pal["gold"], loc=tip_loc, radius=0.016, segs=8))
    head_parts += build_spiked_halo(Vector((0.0, 0.155, 1.47)), 0.195, 12, pal, tilt_x=0.10)
    base.bake_parts_into_joint_mesh("Mesh_Head_q", head_parts, head_pivot_w, pivot_head)

    # ShieldArm (+X): Astrolabe Royal Orb (Globus Cruciger)
    shield_pivot_w = Vector((0.225, -0.02, 1.12))
    pivot_shield = base.make_empty("Pivot_ShieldArm_q", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((0.03, -0.18, -0.10))
    orb_center = shield_pivot_w + shield_hand_local + Vector((0.03, -0.04, 0.04))
    shield_parts = base.build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 1.0, pal)
    shield_parts += add_gem_obj("q_astrolabe_core", orb_center, 0.068, pal, stretch_z=1.0, with_bezel=False)
    shield_parts += [
        base.add_primitive_obj("q_astro_ring_a", "torus", pal["gold"], loc=orb_center, rot=(0.45, 0.35, 0.0), r_bot=0.098, r_top=0.013, segs=22),
        base.add_primitive_obj("q_astro_ring_b", "torus", pal["gold"], loc=orb_center, rot=(-0.45, 0.90, 0.4), r_bot=0.112, r_top=0.011, segs=22),
    ]
    shield_parts += base.build_latin_cross_parts(orb_center + Vector((0.0, 0.0, 0.105)), 0.09, 0.065, 0.016, pal)
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_q", shield_parts, shield_pivot_w, pivot_shield)

    # WeaponArm (-X): Winged Crescent-Prong Astral Trident
    weapon_pivot_w = Vector((-0.225, -0.02, 1.12))
    pivot_weapon = base.make_empty("Pivot_WeaponArm_q", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((-0.02, -0.18, -0.10))
    t_grip = weapon_pivot_w + weapon_hand_local
    t_rot = Matrix.Rotation(0.08, 4, "X")

    def tpt(x_off: float, z_off: float) -> Vector:
        return t_grip + (t_rot @ Vector((x_off, 0.0, z_off)))

    weapon_parts = base.build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 1.0, pal)
    weapon_parts += [
        base.add_primitive_obj("q_trident_shaft", "cyl", pal["gold"], loc=tpt(0.0, -0.14), rot=(0.08, 0.0, 0.0), r_bot=0.020, r_top=0.020, height=1.06, segs=12),
        base.add_primitive_obj("q_trident_bar", "box", pal["gold"], loc=tpt(0.0, 0.39), rot=(0.08, 0.0, 0.0), size=(0.225, 0.044, 0.040), bevel_width=0.006),
        base.add_diamond_blade_obj("q_trident_center", length=0.39, base_half_w=0.038, shoulder_half_w=0.024, ridge=0.027, mat=pal["steel"], loc=tpt(0.0, 0.40), rot=(0.08, 0.0, 0.0)),
    ]
    weapon_parts += add_gem_obj("q_trident_heart", tpt(0.0, 0.39) + Vector((0.0, -0.025, 0.0)), 0.026, pal, with_bezel=False)
    for sx in (-1.0, 1.0):
        weapon_parts.append(base.add_tube_obj(f"q_tine_{sx}", [tpt(sx * 0.085, 0.39), tpt(sx * 0.14, 0.50), tpt(sx * 0.10, 0.66)], 0.016, pal["gold"]))
        tip_rot = (t_rot @ Matrix.Rotation(sx * -0.16, 4, "Y")).to_euler()
        weapon_parts.append(base.add_primitive_obj(f"q_tine_tip_{sx}", "cone", pal["gold"], loc=tpt(sx * 0.098, 0.69), rot=tip_rot, r_bot=0.021, height=0.075, segs=8))
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_q", weapon_parts, weapon_pivot_w, pivot_weapon)
    return root


def build_sovereign_king(pal) -> bpy.types.Object:
    root = base.make_empty("Piece_k")
    base.bake_parts_into_joint_mesh("Plinth_k", build_reliquary_plinth(0.38, 0.165, pal), Vector((0, 0, 0)), root)

    body_pivot_w = Vector((0.0, 0.0, 0.155))
    pivot_body = base.make_empty("Pivot_Body_k", body_pivot_w, root)

    body_parts = [
        base.add_lathe_obj(
            "k_surcoat",
            [(0.0, 0.155), (0.305, 0.155), (0.275, 0.38), (0.222, 0.78), (0.254, 1.13), (0.228, 1.26), (0.140, 1.32), (0.0, 1.32)],
            32,
            pal["primary"],
            flute_amp=0.010,
            flute_count=12,
            scale_xyz=(1.08, 0.92, 1.0),
            subsurf_levels=1,
        ),
        base.add_primitive_obj("k_belt", "cyl", pal["gold"], loc=(0.0, 0.0, 0.85), scale=(1.08, 0.92, 1.0), r_bot=0.232, r_top=0.236, height=0.058, segs=24, bevel_width=0.006),
        base.add_primitive_obj("k_chain", "torus", pal["gold"], loc=(0.0, -0.06, 1.19), rot=(0.42, 0.0, 0.0), r_bot=0.192, r_top=0.021, segs=28),
        # Gilded Dorsal Spine & Royal Mantle Clasp (+Y)
        base.add_primitive_obj("k_dorsal_crest", "box", pal["gold"], loc=(0.0, 0.24, 1.16), size=(0.085, 0.036, 0.16), bevel_width=0.008),
    ]
    body_parts += add_gem_obj("k_medallion_gem", (0.0, -0.235, 1.09), 0.038, pal, rot=(math.pi * 0.5, 0.0, 0.0))
    body_parts += add_gem_obj("k_dorsal_gem", (0.0, 0.258, 1.18), 0.028, pal, rot=(math.pi * 0.5, 0.0, 0.0))
    for ang in (-0.42, 0.42):
        body_parts.append(base.add_tube_obj(f"k_cuirass_filigree_{ang}", [(math.sin(ang) * 0.285, -math.cos(ang) * 0.26, 0.22), (math.sin(ang) * 0.24, -math.cos(ang) * 0.21, 0.82), (math.sin(ang * 0.65) * 0.25, -math.cos(ang * 0.65) * 0.215, 1.18)], 0.012, pal["gold"]))
    # 11-Fold Deeply Pleated Billowing Sovereign Cloak + Golden Shoulder Pelisse Collar
    body_parts += build_pleated_cloak("k_sovereign_cloak", 1.27, 0.19, 0.23, 0.21, 0.34, 0.31, 0.05, 0.11, 11, pal)
    body_parts.append(
        base.add_primitive_obj("k_mantle_collar", "torus", pal["gold"], loc=(0.0, 0.04, 1.275), r_bot=0.225, r_top=0.022, segs=26)
    )
    # Winged Imperial Shoulder Mantle Crests
    for sx in (-1.0, 1.0):
        body_parts += build_wing_parts(Vector((sx * 0.22, 0.10, 1.24)), sx, 0.26, 0.20, 0.56, -0.12, pal)
    base.bake_parts_into_joint_mesh("Mesh_Body_k", body_parts, body_pivot_w, pivot_body)

    # Head: High Sovereign Dragon-Emperor + Sculpted Visage & Fluted Beard + 4-Arched Cathedral Crown + Halo + Orb & Cross
    head_pivot_w = Vector((0.0, 0.0, 1.32))
    pivot_head = base.make_empty("Pivot_Head_k", head_pivot_w - body_pivot_w, pivot_body)
    head_parts = build_sculpted_visage("k", Vector((0.0, 0.0, 1.445)), 0.118, pal, with_beard=True, beard_len=0.140) + [
        base.add_primitive_obj("k_crown_circlet", "cyl", pal["gold"], loc=(0.0, 0.0, 1.53), r_bot=0.128, r_top=0.144, height=0.068, segs=24, bevel_width=0.006),
        base.add_primitive_obj("k_crown_cap", "sphere", pal["velvet"], loc=(0.0, 0.0, 1.555), radius=0.122, segs=16),
    ]
    head_parts += add_gem_obj("k_crown_orb_gem", (0.0, 0.0, 1.77), 0.040, pal, stretch_z=1.15, with_bezel=False)
    for i in range(8):
        ang = (i * math.pi) / 4.0
        head_parts.append(base.add_primitive_obj(f"k_crown_leaf_{i}", "cone", pal["gold"], loc=(math.sin(ang) * 0.136, -math.cos(ang) * 0.136, 1.60), r_bot=0.028, height=0.088, segs=8))
        if i % 2 == 0:
            head_parts += add_gem_obj(f"k_crown_jewel_{i}", (math.sin(ang) * 0.140, -math.cos(ang) * 0.140, 1.535), 0.018, pal, with_bezel=False)
    # 4 Intersecting Cathedral Crown Arches (X, Y, and 2 Diagonals)
    for ang_z in (0.0, math.pi * 0.25, math.pi * 0.5, math.pi * 0.75):
        rm = Matrix.Rotation(ang_z, 4, "Z")
        pts = [
            rm @ Vector((-0.135, 0.0, 1.555)),
            rm @ Vector((-0.112, 0.0, 1.695)),
            rm @ Vector((0.0, 0.0, 1.750)),
            rm @ Vector((0.112, 0.0, 1.695)),
            rm @ Vector((0.135, 0.0, 1.555)),
        ]
        head_parts.append(base.add_tube_obj(f"k_arch_{ang_z:.2f}", pts, 0.016, pal["gold"]))
    head_parts += base.build_latin_cross_parts(Vector((0.0, 0.0, 1.805)), 0.12, 0.088, 0.022, pal)
    head_parts += build_spiked_halo(Vector((0.0, 0.155, 1.62)), 0.215, 14, pal, tilt_x=0.10)
    base.bake_parts_into_joint_mesh("Mesh_Head_k", head_parts, head_pivot_w, pivot_head)

    # Paired Two-Handed Greatsword Grip: IDENTICAL shoulder Y=-0.03 and Z=1.24 for locked -2.55 -> -1.12 cleave!
    weapon_pivot_w = Vector((-0.255, -0.03, 1.24))
    pivot_weapon = base.make_empty("Pivot_WeaponArm_k", weapon_pivot_w - body_pivot_w, pivot_body)
    weapon_hand_local = Vector((0.255, -0.23, -0.15))
    grip_w = weapon_pivot_w + weapon_hand_local
    weapon_parts = base.build_armored_arm_parts("right", weapon_pivot_w, weapon_hand_local, 1.12, pal)
    weapon_parts += [
        base.add_primitive_obj("k_grip", "cyl", pal["leather"], loc=grip_w + Vector((0.0, 0.0, -0.03)), r_bot=0.020, r_top=0.018, height=0.22, segs=12),
        base.add_primitive_obj("k_pommel", "octa", pal["gold"], loc=grip_w + Vector((0.0, 0.0, 0.095)), radius=0.038),
        base.add_primitive_obj("k_guard", "box", pal["gold"], loc=grip_w + Vector((0.0, 0.0, -0.13)), size=(0.37, 0.044, 0.034), bevel_width=0.006),
        add_flamberge_blade_obj("k_flamberge_blade", length=0.80, base_half_w=0.052, ridge=0.028, mat=pal["steel"], loc=grip_w + Vector((0.0, 0.0, -0.14)), rot=(math.pi, 0.0, 0.0)),
    ]
    for sx in (-1.0, 1.0):
        weapon_parts.append(base.add_primitive_obj(f"k_guard_wing_{sx}", "cone", pal["gold"], loc=grip_w + Vector((sx * 0.195, 0.0, -0.13)), rot=(0.0, sx * -1.15, 0.0), r_bot=0.026, height=0.08, segs=8))
    weapon_parts += add_gem_obj("k_sword_gem", grip_w + Vector((0.0, -0.024, -0.13)), 0.022, pal)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_k", weapon_parts, weapon_pivot_w, pivot_weapon)

    shield_pivot_w = Vector((0.255, -0.03, 1.24))
    pivot_shield = base.make_empty("Pivot_ShieldArm_k", shield_pivot_w - body_pivot_w, pivot_body)
    shield_hand_local = Vector((-0.255, -0.23, -0.09))
    shield_parts = base.build_armored_arm_parts("left", shield_pivot_w, shield_hand_local, 1.12, pal)
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_k", shield_parts, shield_pivot_w, pivot_shield)
    return root


SOVEREIGN_BUILDERS = {
    "p": build_sovereign_pawn,
    "r": build_sovereign_rook,
    "n": build_sovereign_knight,
    "b": build_sovereign_bishop,
    "q": build_sovereign_queen,
    "k": build_sovereign_king,
}


# ---------------------------------------------------------------------------
# High-Res Studio Renderer (Lineup, Close-Up, Rear-3/4)
# ---------------------------------------------------------------------------

def _look_at(obj, target_xyz):
    direction = Vector(target_xyz) - obj.location
    rot_quat = direction.to_track_quat("-Z", "Y")
    obj.rotation_euler = rot_quat.to_euler()


def render_sovereign_studio_suite(white_glb: str, black_glb: str, render_dir: str) -> None:
    base.reset_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    vt_items = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items]
    scene.view_settings.view_transform = "AgX" if "AgX" in vt_items else "Standard"
    scene.view_settings.look = "AgX - Medium High Contrast" if "AgX" in vt_items else "None"

    order = ["p", "r", "n", "b", "q", "k"]

    def import_row(glb_path: str, y_pos: float, yaw_z: float):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        added = [o for o in bpy.data.objects if o not in before and o.parent is None]
        for idx, ptype in enumerate(order):
            match = next((o for o in added if o.name.startswith(f"Piece_{ptype}")), None)
            if match is not None:
                match.rotation_mode = "XYZ"
                match.location = ((idx - 2.5) * 1.18, y_pos, 0.0)
                match.rotation_euler = (0.0, 0.0, yaw_z)

    import_row(white_glb, -0.78, math.radians(-20.0))
    import_row(black_glb, 0.84, math.radians(-16.0))

    world = bpy.data.worlds.new("SovereignStudioWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.028, 0.032, 0.048, 1.0)
    bg.inputs["Strength"].default_value = 1.65
    scene.world = world

    # Alternating dark/light obsidian & ivory checkered studio stage
    dark_sq_mat = base.create_pbr_material("StudioDarkSq", base_color=(0.055, 0.062, 0.088, 1.0), metallic=0.10, roughness=0.22, coat_weight=0.55)
    light_sq_mat = base.create_pbr_material("StudioLightSq", base_color=(0.68, 0.64, 0.56, 1.0), metallic=0.05, roughness=0.26, coat_weight=0.40)
    gold_trim_mat = base.create_pbr_material("StudioGoldTrim", base_color=(0.86, 0.69, 0.22, 1.0), metallic=0.92, roughness=0.20)
    for ix in range(-4, 4):
        for iy in range(-2, 3):
            is_l = (ix + iy) % 2 == 0
            base.add_primitive_obj(
                f"StageSq_{ix}_{iy}",
                "box",
                light_sq_mat if is_l else dark_sq_mat,
                loc=(ix * 1.18 + 0.59, iy * 1.18 - 0.36, -0.05),
                size=(1.175, 1.175, 0.10),
                bevel_width=0.008,
            )
    base.add_primitive_obj("StageRim", "box", gold_trim_mat, loc=(0.0, 0.05, -0.075), size=(11.0, 7.0, 0.06), bevel_width=0.01)

    def add_area(name, loc, target, energy, color, size=5.5):
        ldata = bpy.data.lights.new(name, type="AREA")
        ldata.energy = energy
        ldata.color = color
        ldata.size = size
        lobj = bpy.data.objects.new(name, ldata)
        scene.collection.objects.link(lobj)
        lobj.location = loc
        _look_at(lobj, target)
        return lobj

    add_area("Key", (4.2, -5.8, 5.2), (0.0, 0.0, 0.7), 620.0, (1.0, 0.90, 0.75))
    add_area("Fill", (-5.4, -4.4, 3.8), (0.0, 0.0, 0.7), 280.0, (0.62, 0.78, 1.0))
    add_area("Rim", (0.5, 5.2, 4.6), (0.0, 0.0, 0.8), 540.0, (1.0, 0.82, 0.50))
    add_area("TopSpec", (0.0, -0.5, 6.2), (0.0, 0.0, 0.6), 240.0, (0.90, 0.95, 1.0), size=6.5)

    cam_data = bpy.data.cameras.new("StudioCam")
    cam_data.lens = 46.0
    cam = bpy.data.objects.new("StudioCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    os.makedirs(render_dir, exist_ok=True)
    shots = [
        ("sovereign_studio_lineup.png", (0.0, -9.4, 3.15), (0.0, 0.05, 0.80), 42.0),
        ("sovereign_studio_closeup.png", (1.35, -4.55, 1.76), (1.15, 0.08, 0.98), 50.0),
        ("sovereign_studio_rear.png", (-2.9, 6.4, 2.85), (0.25, 0.0, 0.86), 44.0),
    ]
    for fname, cloc, ctarget, lens in shots:
        cam_data.lens = lens
        cam.location = cloc
        _look_at(cam, ctarget)
        out_p = os.path.join(render_dir, fname)
        scene.render.filepath = out_p
        bpy.ops.render.render(write_still=True)
        print(f"[STUDIO_RENDER] {out_p}")


def build_and_export() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    exported = {}

    for variant in ("w", "b"):
        base.reset_scene()
        pal = build_sovereign_palette(variant)
        roots = [builder(pal) for builder in SOVEREIGN_BUILDERS.values()]
        base.select_hierarchy(roots)

        filename = "sovereign_white.glb" if variant == "w" else "sovereign_black.glb"
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
        exported[variant] = out_path
        size_kb = os.path.getsize(out_path) / 1024.0
        print(f"[EXPORTED] {out_path} ({size_kb:.1f} KB)")

    if RENDER_DIR:
        render_sovereign_studio_suite(exported["w"], exported["b"], RENDER_DIR)


if __name__ == "__main__":
    build_and_export()
