"""Headless Blender 5.3 generator for Samurai, Pharaoh, and Astral 3D chess armies.

Generates:
  - public/models/samurai_white.glb & samurai_black.glb
  - public/models/pharaoh_white.glb & pharaoh_black.glb
  - public/models/astral_white.glb  & astral_black.glb
  - Optional combined lineup render PNG for visual verification

Reuses bmesh helpers and the exact Piece_<type> / Pivot_* hierarchy contract
from build_wizard_pieces.py so PieceFactory + PieceAnimator animate all armies cleanly.
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
PREVIEW_PATH = os.environ.get("WIZARD_THEME_PREVIEW_PNG", "").strip()


def build_themed_palette(army: str, variant: str):
    """Creates 2K PBR materials tailored to Samurai, Pharaoh, or Astral armies."""
    is_w = variant == "w"
    p_alb, p_rgh, p_nrm = base.generate_stone_textures(variant, res=2048)

    if army == "samurai":
        sec_rgb = (0.72, 0.14, 0.14, 1.0) if is_w else (0.48, 0.09, 0.10, 1.0)
        gold_rgb = (0.85, 0.66, 0.22)
        steel_rgb = (0.84, 0.87, 0.91) if is_w else (0.62, 0.66, 0.72)
        prim_tint = (0.95, 0.92, 0.88, 1.0) if is_w else (0.07, 0.07, 0.09, 1.0)
        coat = 0.55 if not is_w else 0.38  # Deep glossy urushi black lacquer
        metal_prim = 0.04 if is_w else 0.18
    elif army == "pharaoh":
        sec_rgb = (0.11, 0.36, 0.58, 1.0) if is_w else (0.10, 0.28, 0.48, 1.0)  # Royal Lapis
        gold_rgb = (0.92, 0.72, 0.18)
        steel_rgb = (0.90, 0.76, 0.34) if is_w else (0.82, 0.66, 0.24)  # Solar bronze/gold blades
        prim_tint = (0.96, 0.90, 0.76, 1.0) if is_w else (0.09, 0.09, 0.12, 1.0)
        coat = 0.32
        metal_prim = 0.04 if is_w else 0.12
    else:  # astral
        sec_rgb = (0.56, 0.38, 0.94, 1.0) if is_w else (0.28, 0.16, 0.54, 1.0)
        gold_rgb = (0.88, 0.74, 0.33)
        steel_rgb = (0.49, 0.84, 0.99) if is_w else (0.76, 0.52, 0.99)  # Celestial crystal/plasma
        prim_tint = (0.94, 0.93, 0.98, 1.0) if is_w else (0.06, 0.05, 0.15, 1.0)
        coat = 0.62
        metal_prim = 0.08 if is_w else 0.24

    g_alb, g_rgh, g_nrm = base.generate_brushed_metal_textures(
        f"{army}_Gold_{variant}", gold_rgb, 0.20, seed=6101 if is_w else 6202
    )
    s_alb, s_rgh, s_nrm = base.generate_brushed_metal_textures(
        f"{army}_Steel_{variant}", steel_rgb, 0.16, seed=7101 if is_w else 7202
    )

    primary = base.create_pbr_material(
        f"{army}_Primary_{variant}",
        albedo_img=p_alb if army != "pharaoh" or not is_w else None,
        rough_img=p_rgh,
        normal_img=p_nrm,
        base_color=prim_tint,
        metallic=metal_prim,
        roughness=0.24 if is_w else 0.20,
        coat_weight=coat,
        coat_roughness=0.14,
        normal_strength=0.25,
    )
    # For white pharaoh alabaster or tinted alabaster/obsidian, still bind normal & roughness maps cleanly
    if army == "pharaoh" and is_w:
        primary = base.create_pbr_material(
            f"{army}_Primary_{variant}",
            rough_img=p_rgh,
            normal_img=p_nrm,
            base_color=(0.95, 0.89, 0.74, 1.0),
            metallic=0.04,
            coat_weight=0.32,
            normal_strength=0.22,
        )

    secondary = base.create_pbr_material(
        f"{army}_Secondary_{variant}",
        rough_img=p_rgh,
        normal_img=p_nrm,
        base_color=sec_rgb,
        metallic=0.16 if army != "astral" else 0.45,
        coat_weight=0.28,
        normal_strength=0.20,
    )
    gold = base.create_pbr_material(
        f"{army}_Gold_{variant}",
        albedo_img=g_alb,
        rough_img=g_rgh,
        normal_img=g_nrm,
        metallic=0.92,
        normal_strength=0.18,
    )
    steel = base.create_pbr_material(
        f"{army}_Steel_{variant}",
        albedo_img=s_alb,
        rough_img=s_rgh,
        normal_img=s_nrm,
        metallic=0.90 if army != "astral" else 0.65,
        coat_weight=0.3 if army == "astral" else 0.0,
        normal_strength=0.16,
    )
    recess = base.create_pbr_material(
        f"{army}_Recess_{variant}",
        base_color=(0.025, 0.025, 0.035, 1.0),
        metallic=0.12,
        roughness=0.76,
    )
    leather = base.create_pbr_material(
        f"{army}_Leather_{variant}",
        base_color=(0.24, 0.14, 0.10, 1.0),
        metallic=0.05,
        roughness=0.55,
    )
    parchment = base.create_pbr_material(
        f"{army}_Parchment_{variant}",
        base_color=(0.91, 0.84, 0.69, 1.0),
        metallic=0.02,
        roughness=0.66,
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


def make_pavise_shield_parts(center_w: Vector, rot_euler, width: float, height: float, pal, style: str):
    """Curved-top or rectangular war shield for Samurai (Tate) / Pharaoh / Astral."""
    hw, hh = width * 0.5, height * 0.5
    if style == "samurai":
        pts = [(-hw, hh), (hw, hh), (hw, -hh), (-hw, -hh)]
    elif style == "pharaoh":
        pts = [
            (-hw, hh * 0.45),
            (-hw * 0.72, hh * 0.88),
            (0.0, hh),
            (hw * 0.72, hh * 0.88),
            (hw, hh * 0.45),
            (hw, -hh),
            (-hw, -hh),
        ]
    else:  # astral diamond kite
        pts = [(0.0, hh), (hw, hh * 0.25), (0.0, -hh), (-hw, hh * 0.25)]

    base_rot = Euler(rot_euler, "YXZ").to_matrix().to_4x4()
    stand_euler = (base_rot @ Matrix.Rotation(math.pi * 0.5, 4, "X")).to_euler()
    parts = [
        base.add_extruded_poly_obj("sh_plate", pts, 0.026, pal["primary"], bevel_width=0.008, loc=center_w, rot=stand_euler),
        base.add_extruded_poly_obj(
            "sh_rim",
            [(p[0] * 1.10, p[1] * 1.08) for p in pts],
            0.020,
            pal["gold"],
            bevel_width=0.005,
            loc=center_w + (base_rot @ Vector((0.0, 0.004, 0.0))),
            rot=stand_euler,
        ),
    ]
    # Center heraldic emblem
    emblem_loc = center_w + (base_rot @ Vector((0.0, -0.024, 0.04 * height)))
    if style == "samurai":
        parts.append(base.add_primitive_obj("sh_mon", "torus", pal["secondary"], loc=emblem_loc, rot=(base_rot @ Matrix.Rotation(math.pi * 0.5, 4, "X")).to_euler(), r_bot=width * 0.26, r_top=0.015, segs=18))
        parts.append(base.add_primitive_obj("sh_dot", "sphere", pal["gold"], loc=emblem_loc, radius=width * 0.11, segs=10))
    elif style == "pharaoh":
        parts.append(base.add_primitive_obj("sh_sun", "sphere", pal["gold"], loc=emblem_loc, rot=base_rot.to_euler(), scale=(1.0, 0.45, 1.0), radius=width * 0.22, segs=14))
        parts.append(base.add_primitive_obj("sh_lapis", "box", pal["secondary"], loc=center_w + (base_rot @ Vector((0.0, -0.022, -height * 0.18))), rot=base_rot.to_euler(), size=(width * 0.52, 0.014, height * 0.14)))
    else:
        parts.append(base.add_primitive_obj("sh_star", "octa", pal["steel"], loc=emblem_loc, rot=base_rot.to_euler(), scale=(0.8, 0.4, 1.25), radius=width * 0.24))
    return parts


def make_katana_parts(grip_w: Vector, blade_len: float, pal, tilt_x: float = 0.10):
    """Curved single-edged Katana or Nodachi blade."""
    rot_m = Matrix.Rotation(tilt_x, 4, "X")
    def pt(y, z):
        return grip_w + (rot_m @ Vector((0.0, y, z)))

    pts = [
        pt(0.0, 0.08),
        pt(-0.012, 0.08 + blade_len * 0.35),
        pt(-0.036, 0.08 + blade_len * 0.72),
        pt(-0.072, 0.08 + blade_len),
    ]
    return [
        base.add_primitive_obj("k_grip", "cyl", pal["leather"], loc=pt(0.0, -0.02), rot=(tilt_x, 0.0, 0.0), r_bot=0.018, r_top=0.016, height=0.14, segs=10),
        base.add_primitive_obj("k_tsuba", "cyl", pal["gold"], loc=pt(0.0, 0.065), rot=(tilt_x, 0.0, 0.0), r_bot=0.048, r_top=0.048, height=0.016, segs=16, bevel_width=0.003),
        base.add_tube_obj("k_blade", pts, 0.017, pal["steel"], resolution=10, bevel_res=4, taper_end=True),
    ]


def make_khopesh_parts(grip_w: Vector, scale: float, point_down: bool, pal):
    """Egyptian curved sickle-sword Khopesh."""
    d = -1.0 if point_down else 1.0
    pts = [
        grip_w + Vector((0.0, 0.0, d * 0.07 * scale)),
        grip_w + Vector((0.0, -0.01 * scale, d * 0.18 * scale)),
        grip_w + Vector((0.0, -0.10 * scale, d * 0.29 * scale)),
        grip_w + Vector((0.0, -0.11 * scale, d * 0.42 * scale)),
        grip_w + Vector((0.0, -0.03 * scale, d * 0.54 * scale)),
    ]
    return [
        base.add_primitive_obj("kh_grip", "cyl", pal["leather"], loc=grip_w + Vector((0, 0, -d * 0.02 * scale)), r_bot=0.019 * scale, r_top=0.017 * scale, height=0.14 * scale, segs=10),
        base.add_primitive_obj("kh_collar", "cyl", pal["gold"], loc=grip_w + Vector((0, 0, d * 0.06 * scale)), r_bot=0.036 * scale, r_top=0.032 * scale, height=0.03 * scale, segs=12),
        base.add_tube_obj("kh_blade", pts, 0.022 * scale, pal["steel"], resolution=12, bevel_res=4, taper_end=True),
    ]


# ===========================================================================
# 1. SAMURAI ARMY (Ashigaru, Pagoda Keep, Takeda Cavalry, Sohei, Empress, Shogun)
# ===========================================================================

def build_samurai_pawn(pal):
    root = base.make_empty("Piece_p")
    base.bake_parts_into_joint_mesh("Plinth_p", base.build_plinth_parts(0.31, 0.13, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.12))
    pb = base.make_empty("Pivot_Body_p", body_w, root)
    body_parts = [
        base.add_lathe_obj("sp_hakama", [(0, 0.12), (0.25, 0.12), (0.22, 0.26), (0.17, 0.38), (0, 0.38)], 12, pal["secondary"], bevel_width=0.006),
        base.add_primitive_obj("sp_obi", "cyl", pal["gold"], loc=(0, 0, 0.38), r_bot=0.185, r_top=0.180, height=0.055, segs=16),
        base.add_lathe_obj("sp_do", [(0, 0.38), (0.175, 0.39), (0.205, 0.54), (0.18, 0.64), (0.12, 0.67), (0, 0.67)], 12, pal["primary"], scale_xyz=(1.08, 0.88, 1.0), bevel_width=0.008),
    ]
    for i in range(4):
        ang = (i * math.pi) / 2.0 + math.pi / 4.0
        body_parts.append(base.add_primitive_obj(f"sp_kus_{i}", "box", pal["primary"], loc=(math.sin(ang) * 0.175, -math.cos(ang) * 0.175, 0.27), rot=(0.24, 0, ang), size=(0.15, 0.036, 0.17), bevel_width=0.006))
    base.bake_parts_into_joint_mesh("Mesh_Body_p", body_parts, body_w, pb)

    head_w = Vector((0, 0, 0.66))
    ph = base.make_empty("Pivot_Head_p", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("sp_face", "sphere", pal["secondary"], loc=(0, 0, 0.77), radius=0.102, segs=16),
        base.add_primitive_obj("sp_eyes", "box", pal["recess"], loc=(0, -0.09, 0.785), size=(0.115, 0.04, 0.034)),
        # Conical Jingasa war hat
        base.add_lathe_obj("sp_jingasa", [(0.265, 0.81), (0.23, 0.84), (0.11, 0.94), (0.02, 0.99), (0, 1.00)], 24, pal["primary"], subsurf_levels=1),
        base.add_primitive_obj("sp_jing_rim", "torus", pal["gold"], loc=(0, 0, 0.815), r_bot=0.258, r_top=0.012, segs=24),
        base.add_primitive_obj("sp_mon_crest", "octa", pal["gold"], loc=(0, -0.15, 0.90), scale=(1.0, 0.35, 1.2), radius=0.045),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_p", head_parts, head_w, ph)

    sh_w = Vector((0.205, -0.01, 0.59))
    ps = base.make_empty("Pivot_ShieldArm_p", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.17, -0.11))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 0.94, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.03, -0.035, 0.03)), (0.08, 0, 0.45), 0.22, 0.32, pal, "samurai")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_p", sh_parts, sh_w, ps)

    wp_w = Vector((-0.205, -0.01, 0.59))
    pw = base.make_empty("Pivot_WeaponArm_p", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.18, -0.10))
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 0.94, pal)
    wp_parts += make_katana_parts(wp_w + wp_hand, 0.48, pal, tilt_x=0.14)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_p", wp_parts, wp_w, pw)
    return root


def build_samurai_rook(pal):
    root = base.make_empty("Piece_r")
    base.bake_parts_into_joint_mesh("Plinth_r", base.build_plinth_parts(0.36, 0.15, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.14))
    pb = base.make_empty("Pivot_Body_r", body_w, root)
    body_parts = [
        # Sloped Ishigaki stone fortress base + lower pagoda wall
        base.add_lathe_obj("sr_base", [(0, 0.14), (0.31, 0.14), (0.25, 0.42), (0.24, 0.72), (0, 0.72)], 4, pal["primary"], bevel_width=0.014, rot_z=math.pi / 4.0),
        base.add_primitive_obj("sr_eave1", "box", pal["secondary"], loc=(0, 0, 0.56), size=(0.62, 0.62, 0.075), bevel_width=0.015),
        base.add_primitive_obj("sr_eave1_trim", "box", pal["gold"], loc=(0, 0, 0.535), size=(0.65, 0.65, 0.024)),
        base.add_primitive_obj("sr_gate", "box", pal["recess"], loc=(0, -0.24, 0.27), size=(0.15, 0.05, 0.22)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_r", body_parts, body_w, pb)

    wp_w = Vector((0, 0, 0.72))
    pw = base.make_empty("Pivot_WeaponArm_r", wp_w - body_w, pb)
    wp_parts = [
        base.add_primitive_obj("sr_upper_box", "box", pal["primary"], loc=(0, 0, 0.88), size=(0.36, 0.36, 0.32), bevel_width=0.012),
        base.add_primitive_obj("sr_eave2", "box", pal["secondary"], loc=(0, 0, 0.90), size=(0.56, 0.56, 0.065), bevel_width=0.014),
        base.add_primitive_obj("sr_roof", "cone", pal["secondary"], loc=(0, 0, 1.12), rot=(0, 0, math.pi / 4.0), r_bot=0.38, height=0.22, segs=4, bevel_width=0.012),
        base.add_primitive_obj("sr_spire", "cyl", pal["gold"], loc=(0, 0, 1.26), r_bot=0.032, r_top=0.010, height=0.14, segs=10),
        # Forward siege ram beam
        base.add_primitive_obj("sr_ram", "cyl", pal["gold"], loc=(0, -0.26, 0.88), rot=(math.pi / 2.0, 0, 0), r_bot=0.06, r_top=0.025, height=0.28, segs=8),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_r", wp_parts, wp_w, pw)
    return root


def build_samurai_knight(pal):
    root = base.make_empty("Piece_n")
    base.bake_parts_into_joint_mesh("Plinth_n", base.build_plinth_parts(0.36, 0.14, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.13))
    pb = base.make_empty("Pivot_Body_n", body_w, root)
    horse_pts = [(0.16, 0.24), (0.29, 0.34), (0.28, 0.50), (0.24, 0.68), (0.35, 0.62), (0.38, 0.67), (0.28, 0.81), (0.25, 0.91), (0.18, 0.85), (0.06, 0.66), (-0.18, 0.52), (-0.30, 0.48), (-0.31, 0.31), (-0.22, 0.22), (0, 0.20)]
    body_parts = [
        base.add_extruded_poly_obj("sn_horse", horse_pts, 0.20, pal["primary"], bevel_width=0.026, subsurf_levels=1, loc=(0, 0, 0.13), rot=(math.pi * 0.5, 0, -math.pi * 0.5)),
        base.add_primitive_obj("sn_bamen", "box", pal["gold"], loc=(0, -0.32, 0.84), rot=(-0.52, 0, 0), size=(0.12, 0.044, 0.18), bevel_width=0.008),
        base.add_primitive_obj("sn_saddle", "box", pal["secondary"], loc=(0, 0.05, 0.66), size=(0.25, 0.25, 0.085), bevel_width=0.012),
        base.add_primitive_obj("sn_torso", "cyl", pal["primary"], loc=(0, 0.05, 0.84), scale=(1.15, 0.86, 1.0), r_bot=0.12, r_top=0.135, height=0.32, segs=14),
    ]
    for lx, ly in ((-0.09, -0.16), (0.09, -0.16), (-0.095, 0.18), (0.095, 0.18)):
        body_parts.append(base.add_primitive_obj("sn_leg", "cyl", pal["secondary"], loc=(lx, ly, 0.27), r_bot=0.034, r_top=0.044, height=0.28, segs=10))
        body_parts.append(base.add_primitive_obj("sn_hoof", "cyl", pal["gold"], loc=(lx, ly, 0.152), r_bot=0.044, r_top=0.036, height=0.046, segs=10))
    for sx in (-1.0, 1.0):
        body_parts.append(base.add_primitive_obj("sn_sode", "box", pal["secondary"], loc=(sx * 0.145, 0.02, 0.46), size=(0.038, 0.42, 0.22), bevel_width=0.008))
    base.bake_parts_into_joint_mesh("Mesh_Body_n", body_parts, body_w, pb)

    head_w = Vector((0, 0.05, 1.00))
    ph = base.make_empty("Pivot_Head_n", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("sn_kabuto", "sphere", pal["primary"], loc=(0, 0.05, 1.15), radius=0.125, segs=18),
        base.add_primitive_obj("sn_shikoro", "cyl", pal["secondary"], loc=(0, 0.07, 1.10), r_bot=0.175, r_top=0.128, height=0.14, segs=16),
        base.add_primitive_obj("sn_mempo", "box", pal["recess"], loc=(0, -0.065, 1.14), size=(0.12, 0.045, 0.04)),
        # Iconic V-shaped golden Kuwagata horns
        base.add_tube_obj("sn_horn_l", [(0, -0.06, 1.24), (0.09, -0.08, 1.35), (0.14, -0.06, 1.44)], 0.017, pal["gold"], taper_end=True),
        base.add_tube_obj("sn_horn_r", [(0, -0.06, 1.24), (-0.09, -0.08, 1.35), (-0.14, -0.06, 1.44)], 0.017, pal["gold"], taper_end=True),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_n", head_parts, head_w, ph)

    sh_w = Vector((0.185, 0.04, 0.96))
    ps = base.make_empty("Pivot_ShieldArm_n", sh_w - body_w, pb)
    sh_hand = Vector((0.02, -0.16, -0.10))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 0.92, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.03, -0.03, 0.01)), (0.08, 0, 0.55), 0.22, 0.30, pal, "samurai")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_n", sh_parts, sh_w, ps)

    wp_w = Vector((-0.185, 0.04, 0.96))
    pw = base.make_empty("Pivot_WeaponArm_n", wp_w - body_w, pb)
    wp_hand = Vector((-0.01, -0.17, -0.10))
    g_w = wp_w + wp_hand
    tilt = 0.30
    rm = Matrix.Rotation(tilt, 4, "X")
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 0.92, pal)
    wp_parts += [
        base.add_primitive_obj("sn_nag_shaft", "cyl", pal["leather"], loc=g_w + (rm @ Vector((0, 0, 0.14))), rot=(tilt, 0, 0), r_bot=0.022, r_top=0.018, height=0.72, segs=10),
        base.add_primitive_obj("sn_nag_collar", "cyl", pal["gold"], loc=g_w + (rm @ Vector((0, 0, 0.48))), rot=(tilt, 0, 0), r_bot=0.032, r_top=0.032, height=0.04, segs=10),
        base.add_tube_obj("sn_nag_blade", [g_w + (rm @ Vector((0, 0, 0.50))), g_w + (rm @ Vector((0, -0.025, 0.64))), g_w + (rm @ Vector((0, -0.065, 0.78)))], 0.020, pal["steel"], taper_end=True),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_n", wp_parts, wp_w, pw)
    return root


def build_samurai_bishop(pal):
    root = base.make_empty("Piece_b")
    base.bake_parts_into_joint_mesh("Plinth_b", base.build_plinth_parts(0.35, 0.14, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.13))
    pb = base.make_empty("Pivot_Body_b", body_w, root)
    body_parts = [
        base.add_lathe_obj("sb_robe", [(0, 0.13), (0.265, 0.13), (0.24, 0.32), (0.19, 0.72), (0.20, 0.95), (0.14, 1.03), (0, 1.03)], 28, pal["primary"], flute_amp=0.010, flute_count=10, subsurf_levels=1),
        base.add_primitive_obj("sb_kesa", "box", pal["secondary"], loc=(0, -0.215, 0.58), rot=(-0.12, 0, 0.25), size=(0.14, 0.032, 0.68), bevel_width=0.008),
        base.add_primitive_obj("sb_beads", "torus", pal["gold"], loc=(0, -0.04, 0.96), rot=(-0.35, 0, 0), r_bot=0.165, r_top=0.020, segs=22),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_b", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.02))
    ph = base.make_empty("Pivot_Head_b", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("sb_cowl", "sphere", pal["primary"], loc=(0, 0.01, 1.18), scale=(1.05, 1.18, 1.25), radius=0.132, segs=18),
        base.add_primitive_obj("sb_cowl_drape", "cyl", pal["secondary"], loc=(0, 0.06, 1.09), r_bot=0.165, r_top=0.125, height=0.24, segs=16),
        base.add_primitive_obj("sb_face_recess", "box", pal["recess"], loc=(0, -0.105, 1.17), size=(0.11, 0.045, 0.042)),
        base.add_primitive_obj("sb_crest", "torus", pal["gold"], loc=(0, -0.115, 1.28), rot=(math.pi * 0.5, 0, 0), r_bot=0.045, r_top=0.010, segs=16),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_b", head_parts, head_w, ph)

    sh_w = Vector((0.22, -0.02, 0.95))
    ps = base.make_empty("Pivot_ShieldArm_b", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.19, -0.11))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 1.0, pal)
    scroll_c = sh_w + sh_hand + Vector((0.02, -0.05, 0.03))
    sh_parts.append(base.add_primitive_obj("sb_scroll", "cyl", pal["parchment"], loc=scroll_c, rot=(0.4, 0, 0.5), r_bot=0.042, r_top=0.042, height=0.26, segs=14))
    sh_parts.append(base.add_primitive_obj("sb_scroll_cap1", "cyl", pal["gold"], loc=scroll_c, rot=(0.4, 0, 0.5), r_bot=0.048, r_top=0.048, height=0.04, segs=14))
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_b", sh_parts, sh_w, ps)

    wp_w = Vector((-0.22, -0.02, 0.95))
    pw = base.make_empty("Pivot_WeaponArm_b", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.19, -0.10))
    cg = wp_w + wp_hand
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 1.0, pal)
    wp_parts += [
        base.add_primitive_obj("sb_staff", "cyl", pal["leather"], loc=cg + Vector((0, 0, -0.12)), r_bot=0.019, r_top=0.019, height=0.98, segs=12),
        base.add_primitive_obj("sb_ring", "torus", pal["gold"], loc=cg + Vector((0, -0.02, 0.48)), rot=(math.pi * 0.5, 0, 0.4), r_bot=0.11, r_top=0.018, segs=22),
        base.add_primitive_obj("sb_tip", "cone", pal["gold"], loc=cg + Vector((0, -0.02, 0.62)), r_bot=0.032, height=0.10, segs=8),
    ]
    for sx in (-0.09, 0.0, 0.09):
        wp_parts.append(base.add_primitive_obj("sb_jingle", "torus", pal["gold"], loc=cg + Vector((sx, -0.02, 0.46)), rot=(0, math.pi * 0.5, 0), r_bot=0.026, r_top=0.006, segs=12))
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_b", wp_parts, wp_w, pw)
    return root


def build_samurai_queen(pal):
    root = base.make_empty("Piece_q")
    base.bake_parts_into_joint_mesh("Plinth_q", base.build_plinth_parts(0.36, 0.15, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.14))
    pb = base.make_empty("Pivot_Body_q", body_w, root)
    body_parts = [
        base.add_lathe_obj("sq_gown", [(0, 0.14), (0.285, 0.14), (0.255, 0.36), (0.18, 0.72), (0.16, 0.86), (0.21, 1.06), (0.175, 1.14), (0.12, 1.16), (0, 1.16)], 32, pal["primary"], flute_amp=0.012, flute_count=12, scale_xyz=(1.04, 0.94, 1.0), subsurf_levels=1),
        base.add_primitive_obj("sq_obi", "cyl", pal["secondary"], loc=(0, 0, 0.84), r_bot=0.178, r_top=0.172, height=0.11, segs=24, bevel_width=0.008),
        base.add_primitive_obj("sq_obi_cord", "torus", pal["gold"], loc=(0, 0, 0.84), r_bot=0.182, r_top=0.014, segs=24),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_q", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.15))
    ph = base.make_empty("Pivot_Head_q", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("sq_head", "sphere", pal["primary"], loc=(0, 0, 1.26), radius=0.106, segs=18),
        base.add_primitive_obj("sq_hair", "sphere", pal["recess"], loc=(0, 0.03, 1.28), scale=(1.08, 1.1, 1.05), radius=0.112, segs=16),
        base.add_primitive_obj("sq_visor", "box", pal["recess"], loc=(0, -0.092, 1.27), size=(0.10, 0.038, 0.028)),
        base.add_primitive_obj("sq_diadem", "torus", pal["gold"], loc=(0, -0.01, 1.35), rot=(-0.25, 0, 0), r_bot=0.118, r_top=0.016, segs=24),
        # Phoenix crest fan & kanzashi hairpins
        base.add_tube_obj("sq_wing_l", [(0, -0.10, 1.38), (0.11, -0.06, 1.54), (0.18, 0.02, 1.63)], 0.018, pal["gold"], taper_end=True),
        base.add_tube_obj("sq_wing_r", [(0, -0.10, 1.38), (-0.11, -0.06, 1.54), (-0.18, 0.02, 1.63)], 0.018, pal["gold"], taper_end=True),
        base.add_primitive_obj("sq_center_gem", "cone", pal["gold"], loc=(0, -0.09, 1.52), r_bot=0.034, height=0.22, segs=8),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_q", head_parts, head_w, ph)

    sh_w = Vector((0.22, -0.02, 1.08))
    ps = base.make_empty("Pivot_ShieldArm_q", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.18, -0.10))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 1.0, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.04, -0.03, 0.01)), (0.06, 0, 0.58), 0.24, 0.28, pal, "samurai")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_q", sh_parts, sh_w, ps)

    wp_w = Vector((-0.22, -0.02, 1.08))
    pw = base.make_empty("Pivot_WeaponArm_q", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.18, -0.10))
    tg = wp_w + wp_hand
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 1.0, pal)
    wp_parts += [
        base.add_primitive_obj("sq_yari_shaft", "cyl", pal["gold"], loc=tg + Vector((0, 0, -0.14)), rot=(0.08, 0, 0), r_bot=0.019, r_top=0.019, height=1.02, segs=10),
        base.add_diamond_blade_obj("sq_yari_tip", 0.38, 0.034, 0.022, 0.024, pal["steel"], loc=tg + Vector((0, -0.03, 0.36)), rot=(0.08, 0, 0)),
        base.add_tube_obj("sq_jumonji_bar", [tg + Vector((-0.12, -0.03, 0.44)), tg + Vector((-0.06, -0.03, 0.36)), tg + Vector((0.06, -0.03, 0.36)), tg + Vector((0.12, -0.03, 0.44))], 0.016, pal["gold"], taper_end=False),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_q", wp_parts, wp_w, pw)
    return root


def build_samurai_king(pal):
    root = base.make_empty("Piece_k")
    base.bake_parts_into_joint_mesh("Plinth_k", base.build_plinth_parts(0.38, 0.16, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.15))
    pb = base.make_empty("Pivot_Body_k", body_w, root)
    body_parts = [
        base.add_lathe_obj("sk_yoroi", [(0, 0.15), (0.30, 0.15), (0.27, 0.38), (0.22, 0.78), (0.25, 1.12), (0.22, 1.25), (0.14, 1.31), (0, 1.31)], 16, pal["primary"], scale_xyz=(1.08, 0.90, 1.0), bevel_width=0.008),
        base.add_primitive_obj("sk_belt", "cyl", pal["secondary"], loc=(0, 0, 0.83), scale=(1.08, 0.90, 1.0), r_bot=0.23, r_top=0.234, height=0.08, segs=18),
        base.add_primitive_obj("sk_chest_plate", "box", pal["gold"], loc=(0, -0.22, 1.06), size=(0.24, 0.035, 0.26), bevel_width=0.008),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_k", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.30))
    ph = base.make_empty("Pivot_Head_k", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("sk_head", "sphere", pal["primary"], loc=(0, 0, 1.43), radius=0.125, segs=18),
        base.add_primitive_obj("sk_mempo", "box", pal["recess"], loc=(0, -0.105, 1.445), size=(0.128, 0.045, 0.036)),
        base.add_primitive_obj("sk_beard", "cone", pal["secondary"], loc=(0, -0.076, 1.37), rot=(math.pi, 0, 0), r_bot=0.088, height=0.135, segs=12),
        base.add_primitive_obj("sk_kabuto_skirt", "cyl", pal["secondary"], loc=(0, 0.035, 1.41), r_bot=0.188, r_top=0.135, height=0.15, segs=18),
        # Giant Crescent-Moon Kuwagata Horns + Central Sun Crest (reaches 1.88)
        base.add_tube_obj("sk_kuwa_l", [(0, -0.11, 1.54), (0.14, -0.12, 1.70), (0.20, -0.08, 1.86)], 0.022, pal["gold"], taper_end=True),
        base.add_tube_obj("sk_kuwa_r", [(0, -0.11, 1.54), (-0.14, -0.12, 1.70), (-0.20, -0.08, 1.86)], 0.022, pal["gold"], taper_end=True),
        base.add_primitive_obj("sk_sun_disk", "cyl", pal["gold"], loc=(0, -0.12, 1.66), rot=(math.pi * 0.5, 0, 0), r_bot=0.055, r_top=0.055, height=0.024, segs=18),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_k", head_parts, head_w, ph)

    wp_w = Vector((-0.255, -0.03, 1.22))
    pw = base.make_empty("Pivot_WeaponArm_k", wp_w - body_w, pb)
    wp_parts = base.build_armored_arm_parts("right", wp_w, Vector((0.255, -0.23, -0.15)), 1.12, pal)
    wp_parts += base.build_sword_parts(Vector((0.0, -0.26, 1.10)), 0.77, 0.082, 0.24, 0.22, point_down=True, pal=pal)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_k", wp_parts, wp_w, pw)

    sh_w = Vector((0.255, -0.03, 1.22))
    ps = base.make_empty("Pivot_ShieldArm_k", sh_w - body_w, pb)
    sh_parts = base.build_armored_arm_parts("left", sh_w, Vector((-0.255, -0.23, -0.09)), 1.12, pal)
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_k", sh_parts, sh_w, ps)
    return root


# ===========================================================================
# 2. PHARAOH ARMY (Medjay, Obelisk, Anubis Cavalry, Priest of Ra, Queen Isis, Pharaoh)
# ===========================================================================

def build_pharaoh_pawn(pal):
    root = base.make_empty("Piece_p")
    base.bake_parts_into_joint_mesh("Plinth_p", base.build_plinth_parts(0.31, 0.13, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.12))
    pb = base.make_empty("Pivot_Body_p", body_w, root)
    body_parts = [
        base.add_lathe_obj("pp_kilt", [(0, 0.12), (0.24, 0.12), (0.21, 0.28), (0.16, 0.40), (0, 0.40)], 20, pal["primary"], flute_amp=0.008, flute_count=12),
        base.add_primitive_obj("pp_belt", "cyl", pal["gold"], loc=(0, 0, 0.40), r_bot=0.172, r_top=0.168, height=0.05, segs=18),
        base.add_primitive_obj("pp_tab", "box", pal["secondary"], loc=(0, -0.195, 0.28), rot=(-0.15, 0, 0), size=(0.08, 0.025, 0.24), bevel_width=0.005),
        base.add_lathe_obj("pp_torso", [(0, 0.40), (0.16, 0.41), (0.195, 0.56), (0.12, 0.66), (0, 0.66)], 20, pal["primary"], scale_xyz=(1.06, 0.88, 1.0)),
        base.add_primitive_obj("pp_collar", "torus", pal["gold"], loc=(0, 0, 0.61), rot=(0.15, 0, 0), r_bot=0.155, r_top=0.025, segs=20),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_p", body_parts, body_w, pb)

    head_w = Vector((0, 0, 0.65))
    ph = base.make_empty("Pivot_Head_p", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("pp_head", "sphere", pal["primary"], loc=(0, 0, 0.77), radius=0.105, segs=16),
        base.add_primitive_obj("pp_khat", "cyl", pal["secondary"], loc=(0, 0.02, 0.78), r_bot=0.165, r_top=0.115, height=0.22, segs=16, bevel_width=0.012),
        base.add_primitive_obj("pp_eyes", "box", pal["recess"], loc=(0, -0.095, 0.78), size=(0.11, 0.04, 0.03)),
        base.add_primitive_obj("pp_band", "torus", pal["gold"], loc=(0, -0.01, 0.86), r_bot=0.12, r_top=0.014, segs=18),
        base.add_primitive_obj("pp_uraeus", "cone", pal["gold"], loc=(0, -0.135, 0.91), rot=(0.2, 0, 0), r_bot=0.022, height=0.08, segs=8),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_p", head_parts, head_w, ph)

    sh_w = Vector((0.205, -0.01, 0.59))
    ps = base.make_empty("Pivot_ShieldArm_p", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.17, -0.11))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 0.94, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.035, -0.035, 0.02)), (0.08, 0, 0.45), 0.23, 0.31, pal, "pharaoh")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_p", sh_parts, sh_w, ps)

    wp_w = Vector((-0.205, -0.01, 0.59))
    pw = base.make_empty("Pivot_WeaponArm_p", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.18, -0.10))
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 0.94, pal)
    wp_parts += make_khopesh_parts(wp_w + wp_hand, 0.95, False, pal)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_p", wp_parts, wp_w, pw)
    return root


def build_pharaoh_rook(pal):
    root = base.make_empty("Piece_r")
    base.bake_parts_into_joint_mesh("Plinth_r", base.build_plinth_parts(0.36, 0.15, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.14))
    pb = base.make_empty("Pivot_Body_r", body_w, root)
    body_parts = [
        # Tapered Monumental Obelisk / Temple Pylon Shaft
        base.add_lathe_obj("pr_shaft", [(0, 0.14), (0.31, 0.14), (0.26, 0.45), (0.22, 0.84), (0, 0.84)], 4, pal["primary"], bevel_width=0.015, rot_z=math.pi / 4.0),
        base.add_primitive_obj("pr_band1", "box", pal["secondary"], loc=(0, 0, 0.48), size=(0.50, 0.50, 0.065), bevel_width=0.008),
        base.add_primitive_obj("pr_band2", "box", pal["gold"], loc=(0, 0, 0.81), size=(0.45, 0.45, 0.045), bevel_width=0.006),
        base.add_primitive_obj("pr_door", "box", pal["recess"], loc=(0, -0.25, 0.28), size=(0.14, 0.045, 0.25)),
        base.add_primitive_obj("pr_lintel", "box", pal["gold"], loc=(0, -0.25, 0.42), size=(0.24, 0.05, 0.04)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_r", body_parts, body_w, pb)

    wp_w = Vector((0, 0, 0.84))
    pw = base.make_empty("Pivot_WeaponArm_r", wp_w - body_w, pb)
    wp_parts = [
        base.add_primitive_obj("pr_cornice", "box", pal["secondary"], loc=(0, 0, 0.92), size=(0.48, 0.48, 0.12), bevel_width=0.014),
        base.add_primitive_obj("pr_pyramidion", "cone", pal["gold"], loc=(0, 0, 1.14), rot=(0, 0, math.pi / 4.0), r_bot=0.31, height=0.32, segs=4, bevel_width=0.008),
        base.add_primitive_obj("pr_ram", "cyl", pal["gold"], loc=(0, -0.28, 0.92), rot=(math.pi * 0.5, 0, 0), r_bot=0.065, r_top=0.02, height=0.28, segs=8),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_r", wp_parts, wp_w, pw)
    return root


def build_pharaoh_knight(pal):
    root = base.make_empty("Piece_n")
    base.bake_parts_into_joint_mesh("Plinth_n", base.build_plinth_parts(0.36, 0.14, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.13))
    pb = base.make_empty("Pivot_Body_n", body_w, root)
    horse_pts = [(0.16, 0.24), (0.29, 0.34), (0.28, 0.50), (0.24, 0.68), (0.37, 0.62), (0.40, 0.67), (0.28, 0.81), (0.23, 0.90), (0.16, 0.84), (0.06, 0.66), (-0.18, 0.52), (-0.30, 0.48), (-0.31, 0.31), (-0.22, 0.22), (0, 0.20)]
    body_parts = [
        base.add_extruded_poly_obj("pn_steed", horse_pts, 0.20, pal["primary"], bevel_width=0.025, subsurf_levels=1, loc=(0, 0, 0.13), rot=(math.pi * 0.5, 0, -math.pi * 0.5)),
        base.add_primitive_obj("pn_collar", "torus", pal["gold"], loc=(0, -0.21, 0.55), rot=(0.6, 0, 0), r_bot=0.15, r_top=0.022, segs=18),
        # Tall Anubis-style pointed jackal ears on the steed
        base.add_primitive_obj("pn_ear_l", "cone", pal["gold"], loc=(0.065, -0.25, 1.03), rot=(-0.18, 0, 0), r_bot=0.032, height=0.18, segs=6),
        base.add_primitive_obj("pn_ear_r", "cone", pal["gold"], loc=(-0.065, -0.25, 1.03), rot=(-0.18, 0, 0), r_bot=0.032, height=0.18, segs=6),
        base.add_primitive_obj("pn_saddle", "box", pal["secondary"], loc=(0, 0.05, 0.66), size=(0.24, 0.24, 0.08), bevel_width=0.01),
        base.add_primitive_obj("pn_torso", "cyl", pal["primary"], loc=(0, 0.05, 0.84), scale=(1.15, 0.85, 1.0), r_bot=0.118, r_top=0.132, height=0.32, segs=16),
    ]
    for lx, ly in ((-0.09, -0.16), (0.09, -0.16), (-0.095, 0.18), (0.095, 0.18)):
        body_parts.append(base.add_primitive_obj("pn_leg", "cyl", pal["secondary"], loc=(lx, ly, 0.27), r_bot=0.034, r_top=0.044, height=0.28, segs=10))
        body_parts.append(base.add_primitive_obj("pn_hoof", "cyl", pal["gold"], loc=(lx, ly, 0.152), r_bot=0.044, r_top=0.036, height=0.046, segs=10))
    base.bake_parts_into_joint_mesh("Mesh_Body_n", body_parts, body_w, pb)

    head_w = Vector((0, 0.05, 1.00))
    ph = base.make_empty("Pivot_Head_n", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("pn_helm", "cyl", pal["primary"], loc=(0, 0.05, 1.14), r_bot=0.12, r_top=0.11, height=0.24, segs=16, bevel_width=0.008),
        base.add_primitive_obj("pn_eyes", "box", pal["recess"], loc=(0, -0.06, 1.16), size=(0.12, 0.04, 0.03)),
        base.add_primitive_obj("pn_sundisk", "cyl", pal["gold"], loc=(0, 0.05, 1.33), rot=(math.pi * 0.5, 0, 0), r_bot=0.078, r_top=0.078, height=0.032, segs=20),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_n", head_parts, head_w, ph)

    sh_w = Vector((0.185, 0.04, 0.96))
    ps = base.make_empty("Pivot_ShieldArm_n", sh_w - body_w, pb)
    sh_hand = Vector((0.02, -0.16, -0.10))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 0.92, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.035, -0.03, 0.01)), (0.08, 0, 0.55), 0.23, 0.30, pal, "pharaoh")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_n", sh_parts, sh_w, ps)

    wp_w = Vector((-0.185, 0.04, 0.96))
    pw = base.make_empty("Pivot_WeaponArm_n", wp_w - body_w, pb)
    wp_hand = Vector((-0.01, -0.17, -0.10))
    g_w = wp_w + wp_hand
    tilt = 0.32
    rm = Matrix.Rotation(tilt, 4, "X")
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 0.92, pal)
    wp_parts += [
        base.add_primitive_obj("pn_shaft", "cyl", pal["leather"], loc=g_w + (rm @ Vector((0, 0, 0.12))), rot=(tilt, 0, 0), r_bot=0.022, r_top=0.018, height=0.72, segs=10),
        base.add_primitive_obj("pn_vamplate", "cone", pal["gold"], loc=g_w + (rm @ Vector((0, 0, 0.08))), rot=(tilt, 0, 0), r_bot=0.082, height=0.10, segs=16),
        base.add_diamond_blade_obj("pn_tip", 0.22, 0.034, 0.02, 0.024, pal["steel"], loc=g_w + (rm @ Vector((0, 0, 0.48))), rot=(tilt, 0, 0)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_n", wp_parts, wp_w, pw)
    return root


def build_pharaoh_bishop(pal):
    root = base.make_empty("Piece_b")
    base.bake_parts_into_joint_mesh("Plinth_b", base.build_plinth_parts(0.35, 0.14, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.13))
    pb = base.make_empty("Pivot_Body_b", body_w, root)
    body_parts = [
        base.add_lathe_obj("pb_robe", [(0, 0.13), (0.26, 0.13), (0.23, 0.34), (0.185, 0.72), (0.195, 0.94), (0.135, 1.02), (0, 1.02)], 28, pal["primary"], flute_amp=0.009, flute_count=14),
        base.add_primitive_obj("pb_apron", "box", pal["secondary"], loc=(0, -0.21, 0.56), rot=(-0.12, 0, 0), size=(0.09, 0.028, 0.64), bevel_width=0.005),
        base.add_primitive_obj("pb_usekh", "torus", pal["gold"], loc=(0, 0, 0.96), rot=(0.2, 0, 0), r_bot=0.175, r_top=0.032, segs=22),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_b", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.02))
    ph = base.make_empty("Pivot_Head_b", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("pb_head", "sphere", pal["primary"], loc=(0, 0, 1.13), radius=0.106, segs=16),
        base.add_primitive_obj("pb_nemes", "cyl", pal["secondary"], loc=(0, 0.02, 1.15), r_bot=0.16, r_top=0.115, height=0.24, segs=14, bevel_width=0.01),
        base.add_primitive_obj("pb_eyes", "box", pal["recess"], loc=(0, -0.095, 1.15), size=(0.11, 0.04, 0.03)),
        # Solar Sun-Disk & Twin Falcon Feathers
        base.add_primitive_obj("pb_sun", "cyl", pal["gold"], loc=(0, -0.02, 1.32), rot=(math.pi * 0.5, 0, 0), r_bot=0.072, r_top=0.072, height=0.034, segs=20),
        base.add_primitive_obj("pb_feather_l", "box", pal["gold"], loc=(0.045, 0, 1.42), size=(0.048, 0.022, 0.22), bevel_width=0.006),
        base.add_primitive_obj("pb_feather_r", "box", pal["gold"], loc=(-0.045, 0, 1.42), size=(0.048, 0.022, 0.22), bevel_width=0.006),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_b", head_parts, head_w, ph)

    sh_w = Vector((0.22, -0.02, 0.95))
    ps = base.make_empty("Pivot_ShieldArm_b", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.19, -0.11))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 1.0, pal)
    sc = sh_w + sh_hand + Vector((0.02, -0.05, 0.03))
    sh_parts.append(base.add_primitive_obj("pb_papyrus", "box", pal["parchment"], loc=sc, rot=(-0.6, 0, -0.2), size=(0.20, 0.018, 0.17)))
    sh_parts.append(base.add_primitive_obj("pb_roll_l", "cyl", pal["gold"], loc=sc + Vector((-0.10, 0, 0)), rot=(-0.6, 0, -0.2), r_bot=0.022, r_top=0.022, height=0.19, segs=10))
    sh_parts.append(base.add_primitive_obj("pb_roll_r", "cyl", pal["gold"], loc=sc + Vector((0.10, 0, 0)), rot=(-0.6, 0, -0.2), r_bot=0.022, r_top=0.022, height=0.19, segs=10))
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_b", sh_parts, sh_w, ps)

    wp_w = Vector((-0.22, -0.02, 0.95))
    pw = base.make_empty("Pivot_WeaponArm_b", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.19, -0.10))
    cg = wp_w + wp_hand
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 1.0, pal)
    wp_parts += [
        base.add_primitive_obj("pb_staff", "cyl", pal["gold"], loc=cg + Vector((0, 0, -0.14)), r_bot=0.019, r_top=0.019, height=0.92, segs=12),
        base.add_primitive_obj("pb_ankh_bar", "box", pal["gold"], loc=cg + Vector((0, -0.02, 0.36)), size=(0.18, 0.028, 0.028), bevel_width=0.004),
        base.add_primitive_obj("pb_ankh_loop", "torus", pal["gold"], loc=cg + Vector((0, -0.02, 0.47)), rot=(math.pi * 0.5, 0, 0), scale=(0.82, 1.0, 1.18), r_bot=0.095, r_top=0.020, segs=20),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_b", wp_parts, wp_w, pw)
    return root


def build_pharaoh_queen(pal):
    root = base.make_empty("Piece_q")
    base.bake_parts_into_joint_mesh("Plinth_q", base.build_plinth_parts(0.36, 0.15, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.14))
    pb = base.make_empty("Pivot_Body_q", body_w, root)
    body_parts = [
        base.add_lathe_obj("pq_gown", [(0, 0.14), (0.275, 0.14), (0.24, 0.38), (0.17, 0.76), (0.195, 1.02), (0.12, 1.14), (0, 1.14)], 28, pal["primary"], flute_amp=0.010, flute_count=14, scale_xyz=(1.04, 0.94, 1.0)),
        base.add_primitive_obj("pq_girdle", "cyl", pal["gold"], loc=(0, 0, 0.84), r_bot=0.175, r_top=0.170, height=0.06, segs=22),
        base.add_primitive_obj("pq_collar", "torus", pal["secondary"], loc=(0, 0, 1.04), rot=(0.18, 0, 0), r_bot=0.185, r_top=0.032, segs=22),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_q", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.15))
    ph = base.make_empty("Pivot_Head_q", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("pq_head", "sphere", pal["primary"], loc=(0, 0, 1.26), radius=0.106, segs=16),
        base.add_primitive_obj("pq_wig", "cyl", pal["secondary"], loc=(0, 0.03, 1.22), r_bot=0.155, r_top=0.11, height=0.26, segs=16),
        base.add_primitive_obj("pq_eyes", "box", pal["recess"], loc=(0, -0.094, 1.27), size=(0.105, 0.038, 0.028)),
        base.add_primitive_obj("pq_crown_ring", "cyl", pal["gold"], loc=(0, 0, 1.35), r_bot=0.115, r_top=0.125, height=0.055, segs=20),
        # Hathor Horns cradling Golden Solar Disk
        base.add_tube_obj("pq_horn_l", [(0.02, -0.02, 1.38), (0.11, -0.02, 1.49), (0.08, -0.02, 1.65)], 0.018, pal["gold"], taper_end=True),
        base.add_tube_obj("pq_horn_r", [(-0.02, -0.02, 1.38), (-0.11, -0.02, 1.49), (-0.08, -0.02, 1.65)], 0.018, pal["gold"], taper_end=True),
        base.add_primitive_obj("pq_sundisk", "sphere", pal["gold"], loc=(0, -0.02, 1.52), scale=(1.0, 0.55, 1.0), radius=0.072, segs=16),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_q", head_parts, head_w, ph)

    sh_w = Vector((0.22, -0.02, 1.08))
    ps = base.make_empty("Pivot_ShieldArm_q", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.18, -0.10))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 1.0, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.04, -0.03, 0.01)), (0.06, 0, 0.58), 0.24, 0.30, pal, "pharaoh")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_q", sh_parts, sh_w, ps)

    wp_w = Vector((-0.22, -0.02, 1.08))
    pw = base.make_empty("Pivot_WeaponArm_q", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.18, -0.10))
    tg = wp_w + wp_hand
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 1.0, pal)
    wp_parts += [
        base.add_primitive_obj("pq_staff", "cyl", pal["gold"], loc=tg + Vector((0, 0, -0.14)), rot=(0.08, 0, 0), r_bot=0.019, r_top=0.019, height=1.02, segs=10),
        base.add_primitive_obj("pq_sun_top", "torus", pal["gold"], loc=tg + Vector((0, -0.04, 0.45)), rot=(math.pi * 0.5, 0, 0), r_bot=0.088, r_top=0.018, segs=20),
        base.add_diamond_blade_obj("pq_spear", 0.32, 0.034, 0.02, 0.024, pal["steel"], loc=tg + Vector((0, -0.04, 0.52)), rot=(0.08, 0, 0)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_q", wp_parts, wp_w, pw)
    return root


def build_pharaoh_king(pal):
    root = base.make_empty("Piece_k")
    base.bake_parts_into_joint_mesh("Plinth_k", base.build_plinth_parts(0.38, 0.16, pal), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.15))
    pb = base.make_empty("Pivot_Body_k", body_w, root)
    body_parts = [
        base.add_lathe_obj("pk_robe", [(0, 0.15), (0.295, 0.15), (0.26, 0.38), (0.215, 0.78), (0.245, 1.12), (0.22, 1.24), (0.14, 1.30), (0, 1.30)], 24, pal["primary"], scale_xyz=(1.08, 0.90, 1.0)),
        base.add_primitive_obj("pk_belt", "cyl", pal["gold"], loc=(0, 0, 0.83), scale=(1.08, 0.90, 1.0), r_bot=0.228, r_top=0.232, height=0.06, segs=22),
        base.add_primitive_obj("pk_usekh", "torus", pal["gold"], loc=(0, -0.04, 1.18), rot=(0.35, 0, 0), r_bot=0.192, r_top=0.032, segs=24),
        base.add_primitive_obj("pk_scarab", "octa", pal["secondary"], loc=(0, -0.23, 1.08), scale=(1.2, 0.45, 1.4), radius=0.056),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_k", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.30))
    ph = base.make_empty("Pivot_Head_k", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("pk_head", "sphere", pal["primary"], loc=(0, 0, 1.425), radius=0.118, segs=16),
        base.add_primitive_obj("pk_visor", "box", pal["recess"], loc=(0, -0.105, 1.445), size=(0.125, 0.04, 0.032)),
        base.add_primitive_obj("pk_beard", "cyl", pal["gold"], loc=(0, -0.10, 1.335), rot=(-0.15, 0, 0), r_bot=0.022, r_top=0.030, height=0.13, segs=10),
        # Striped Nemes Headdress Wings
        base.add_primitive_obj("pk_nemes_l", "box", pal["secondary"], loc=(0.135, 0.0, 1.38), rot=(0, -0.18, 0.22), size=(0.085, 0.14, 0.25), bevel_width=0.012),
        base.add_primitive_obj("pk_nemes_r", "box", pal["secondary"], loc=(-0.135, 0.0, 1.38), rot=(0, 0.18, -0.22), size=(0.085, 0.14, 0.25), bevel_width=0.012),
        # Pschent Double Crown reaching 1.88
        base.add_primitive_obj("pk_deshret", "cyl", pal["secondary"], loc=(0, 0, 1.54), r_bot=0.122, r_top=0.145, height=0.11, segs=20),
        base.add_primitive_obj("pk_hedjet", "cone", pal["gold"], loc=(0, 0, 1.72), r_bot=0.095, height=0.30, segs=16),
        base.add_primitive_obj("pk_uraeus", "cone", pal["gold"], loc=(0, -0.145, 1.59), rot=(0.25, 0, 0), r_bot=0.024, height=0.09, segs=8),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_k", head_parts, head_w, ph)

    wp_w = Vector((-0.255, -0.03, 1.22))
    pw = base.make_empty("Pivot_WeaponArm_k", wp_w - body_w, pb)
    wp_parts = base.build_armored_arm_parts("right", wp_w, Vector((0.255, -0.23, -0.15)), 1.12, pal)
    wp_parts += base.build_sword_parts(Vector((0.0, -0.26, 1.10)), 0.77, 0.09, 0.30, 0.20, point_down=True, pal=pal)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_k", wp_parts, wp_w, pw)

    sh_w = Vector((0.255, -0.03, 1.22))
    ps = base.make_empty("Pivot_ShieldArm_k", sh_w - body_w, pb)
    sh_parts = base.build_armored_arm_parts("left", sh_w, Vector((-0.255, -0.23, -0.09)), 1.12, pal)
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_k", sh_parts, sh_w, ps)
    return root


# ===========================================================================
# 3. ASTRAL ARMY (Sentinel, Astrolabe Spire, Winged Construct, Oracle, Valkyrie, Archon)
# ===========================================================================

def build_astral_pawn(pal):
    root = base.make_empty("Piece_p")
    base.bake_parts_into_joint_mesh("Plinth_p", base.build_plinth_parts(0.31, 0.13, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.12))
    pb = base.make_empty("Pivot_Body_p", body_w, root)
    body_parts = [
        base.add_lathe_obj("ap_lower", [(0, 0.15), (0.20, 0.18), (0.14, 0.38), (0.21, 0.56), (0.13, 0.66), (0, 0.66)], 8, pal["primary"], bevel_width=0.012),
        base.add_primitive_obj("ap_core_ring", "torus", pal["gold"], loc=(0, 0, 0.38), rot=(0.15, 0, 0), r_bot=0.21, r_top=0.014, segs=22),
        base.add_primitive_obj("ap_chest_gem", "octa", pal["steel"], loc=(0, -0.185, 0.52), scale=(0.8, 0.5, 1.3), radius=0.052),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_p", body_parts, body_w, pb)

    head_w = Vector((0, 0, 0.65))
    ph = base.make_empty("Pivot_Head_p", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("ap_helm", "cone", pal["primary"], loc=(0, 0, 0.86), r_bot=0.128, height=0.34, segs=8, bevel_width=0.008),
        base.add_primitive_obj("ap_visor", "box", pal["steel"], loc=(0, -0.10, 0.78), size=(0.032, 0.04, 0.13)),
        base.add_primitive_obj("ap_halo", "torus", pal["gold"], loc=(0, 0.06, 0.85), rot=(math.pi * 0.5, 0, 0), r_bot=0.175, r_top=0.013, segs=24),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_p", head_parts, head_w, ph)

    sh_w = Vector((0.205, -0.01, 0.59))
    ps = base.make_empty("Pivot_ShieldArm_p", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.17, -0.11))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 0.94, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.035, -0.035, 0.02)), (0.08, 0, 0.45), 0.24, 0.34, pal, "astral")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_p", sh_parts, sh_w, ps)

    wp_w = Vector((-0.205, -0.01, 0.59))
    pw = base.make_empty("Pivot_WeaponArm_p", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.18, -0.10))
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 0.94, pal)
    wp_parts += base.build_sword_parts(wp_w + wp_hand, 0.48, 0.062, 0.17, 0.11, False, pal, tilt_x=0.12)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_p", wp_parts, wp_w, pw)
    return root


def build_astral_rook(pal):
    root = base.make_empty("Piece_r")
    base.bake_parts_into_joint_mesh("Plinth_r", base.build_plinth_parts(0.36, 0.15, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.14))
    pb = base.make_empty("Pivot_Body_r", body_w, root)
    body_parts = [
        base.add_lathe_obj("ar_spire", [(0, 0.14), (0.29, 0.14), (0.22, 0.48), (0.26, 0.80), (0, 0.80)], 6, pal["primary"], bevel_width=0.012),
        base.add_primitive_obj("ar_gimbal", "torus", pal["gold"], loc=(0, 0, 0.52), rot=(0.45, 0.3, 0), r_bot=0.31, r_top=0.018, segs=26),
        base.add_primitive_obj("ar_core", "octa", pal["steel"], loc=(0, 0, 0.52), radius=0.11),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_r", body_parts, body_w, pb)

    wp_w = Vector((0, 0, 0.80))
    pw = base.make_empty("Pivot_WeaponArm_r", wp_w - body_w, pb)
    wp_parts = [
        base.add_primitive_obj("ar_ring_top", "torus", pal["gold"], loc=(0, 0, 0.92), r_bot=0.29, r_top=0.025, segs=24),
        base.add_primitive_obj("ar_orb", "octa", pal["steel"], loc=(0, 0, 1.06), radius=0.12),
        base.add_primitive_obj("ar_ram", "cone", pal["gold"], loc=(0, -0.34, 0.92), rot=(math.pi * 0.5, 0, 0), r_bot=0.08, height=0.26, segs=6),
    ]
    for i in range(6):
        ang = (i * math.pi) / 3.0
        wp_parts.append(base.add_primitive_obj(f"ar_tooth_{i}", "cone", pal["primary"], loc=(math.sin(ang) * 0.27, -math.cos(ang) * 0.27, 1.12), r_bot=0.06, height=0.32, segs=6))
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_r", wp_parts, wp_w, pw)
    return root


def build_astral_knight(pal):
    root = base.make_empty("Piece_n")
    base.bake_parts_into_joint_mesh("Plinth_n", base.build_plinth_parts(0.36, 0.14, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.13))
    pb = base.make_empty("Pivot_Body_n", body_w, root)
    horse_pts = [(0.16, 0.24), (0.29, 0.34), (0.28, 0.50), (0.24, 0.68), (0.37, 0.62), (0.40, 0.67), (0.28, 0.81), (0.25, 0.91), (0.18, 0.85), (0.06, 0.66), (-0.18, 0.52), (-0.30, 0.48), (-0.31, 0.31), (-0.22, 0.22), (0, 0.20)]
    body_parts = [
        base.add_extruded_poly_obj("an_pegasus", horse_pts, 0.20, pal["primary"], bevel_width=0.025, subsurf_levels=1, loc=(0, 0, 0.13), rot=(math.pi * 0.5, 0, -math.pi * 0.5)),
        base.add_primitive_obj("an_horn", "cone", pal["steel"], loc=(0, -0.35, 0.96), rot=(0.8, 0, 0), r_bot=0.022, height=0.14, segs=8),
        base.add_primitive_obj("an_saddle", "box", pal["gold"], loc=(0, 0.05, 0.66), size=(0.24, 0.24, 0.08), bevel_width=0.01),
        base.add_primitive_obj("an_torso", "cyl", pal["primary"], loc=(0, 0.05, 0.84), scale=(1.15, 0.85, 1.0), r_bot=0.118, r_top=0.132, height=0.32, segs=12),
    ]
    # Swept Astral Pegasus Wings
    for sx in (-1.0, 1.0):
        body_parts.append(base.add_primitive_obj("an_wing", "box", pal["steel"], loc=(sx * 0.18, 0.16, 0.72), rot=(-0.45, sx * 0.38, sx * -0.25), size=(0.025, 0.44, 0.16), bevel_width=0.005))
        body_parts.append(base.add_primitive_obj("an_wing_trim", "box", pal["gold"], loc=(sx * 0.18, 0.18, 0.80), rot=(-0.45, sx * 0.38, sx * -0.25), size=(0.032, 0.46, 0.035)))
    for lx, ly in ((-0.09, -0.16), (0.09, -0.16), (-0.095, 0.18), (0.095, 0.18)):
        body_parts.append(base.add_primitive_obj("an_leg", "cyl", pal["secondary"], loc=(lx, ly, 0.27), r_bot=0.034, r_top=0.044, height=0.28, segs=10))
        body_parts.append(base.add_primitive_obj("an_hoof", "cyl", pal["gold"], loc=(lx, ly, 0.152), r_bot=0.044, r_top=0.036, height=0.046, segs=10))
    base.bake_parts_into_joint_mesh("Mesh_Body_n", body_parts, body_w, pb)

    head_w = Vector((0, 0.05, 1.00))
    ph = base.make_empty("Pivot_Head_n", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("an_helm", "cone", pal["primary"], loc=(0, 0.05, 1.18), r_bot=0.128, height=0.30, segs=8, bevel_width=0.008),
        base.add_primitive_obj("an_visor", "box", pal["steel"], loc=(0, -0.06, 1.16), size=(0.032, 0.04, 0.14)),
        base.add_primitive_obj("an_halo", "torus", pal["gold"], loc=(0, 0.10, 1.22), rot=(math.pi * 0.5, 0, 0), r_bot=0.17, r_top=0.014, segs=22),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_n", head_parts, head_w, ph)

    sh_w = Vector((0.185, 0.04, 0.96))
    ps = base.make_empty("Pivot_ShieldArm_n", sh_w - body_w, pb)
    sh_hand = Vector((0.02, -0.16, -0.10))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 0.92, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.035, -0.03, 0.01)), (0.08, 0, 0.55), 0.24, 0.34, pal, "astral")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_n", sh_parts, sh_w, ps)

    wp_w = Vector((-0.185, 0.04, 0.96))
    pw = base.make_empty("Pivot_WeaponArm_n", wp_w - body_w, pb)
    wp_hand = Vector((-0.01, -0.17, -0.10))
    g_w = wp_w + wp_hand
    tilt = 0.32
    rm = Matrix.Rotation(tilt, 4, "X")
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 0.92, pal)
    wp_parts += [
        base.add_primitive_obj("an_shaft", "cyl", pal["gold"], loc=g_w + (rm @ Vector((0, 0, 0.12))), rot=(tilt, 0, 0), r_bot=0.020, r_top=0.018, height=0.72, segs=10),
        base.add_primitive_obj("an_guard", "octa", pal["gold"], loc=g_w + (rm @ Vector((0, 0, 0.08))), radius=0.068),
        base.add_diamond_blade_obj("an_tip", 0.24, 0.038, 0.02, 0.026, pal["steel"], loc=g_w + (rm @ Vector((0, 0, 0.48))), rot=(tilt, 0, 0)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_n", wp_parts, wp_w, pw)
    return root


def build_astral_bishop(pal):
    root = base.make_empty("Piece_b")
    base.bake_parts_into_joint_mesh("Plinth_b", base.build_plinth_parts(0.35, 0.14, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.13))
    pb = base.make_empty("Pivot_Body_b", body_w, root)
    body_parts = [
        base.add_lathe_obj("ab_robe", [(0, 0.13), (0.26, 0.13), (0.21, 0.42), (0.18, 0.85), (0.14, 1.02), (0, 1.02)], 12, pal["primary"], flute_amp=0.008, flute_count=6, bevel_width=0.010),
        base.add_primitive_obj("ab_orbit", "torus", pal["gold"], loc=(0, 0, 0.78), rot=(0.25, 0.2, 0), r_bot=0.25, r_top=0.014, segs=26),
        base.add_primitive_obj("ab_core", "octa", pal["steel"], loc=(0, -0.19, 0.82), scale=(0.8, 0.45, 1.4), radius=0.055),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_b", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.02))
    ph = base.make_empty("Pivot_Head_b", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("ab_head", "sphere", pal["primary"], loc=(0, 0, 1.13), radius=0.106, segs=16),
        base.add_primitive_obj("ab_visor", "box", pal["steel"], loc=(0, -0.095, 1.15), size=(0.11, 0.038, 0.025)),
        base.add_primitive_obj("ab_tiara_c", "cone", pal["gold"], loc=(0, 0, 1.36), r_bot=0.055, height=0.28, segs=6),
        base.add_primitive_obj("ab_tiara_l", "cone", pal["gold"], loc=(0.085, 0, 1.29), rot=(0, 0.22, 0), r_bot=0.036, height=0.20, segs=6),
        base.add_primitive_obj("ab_tiara_r", "cone", pal["gold"], loc=(-0.085, 0, 1.29), rot=(0, -0.22, 0), r_bot=0.036, height=0.20, segs=6),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Head_b", head_parts, head_w, ph)

    sh_w = Vector((0.22, -0.02, 0.95))
    ps = base.make_empty("Pivot_ShieldArm_b", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.19, -0.11))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 1.0, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.02, -0.05, 0.04)), (-0.6, 0.1, -0.25), 0.22, 0.26, pal, "astral")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_b", sh_parts, sh_w, ps)

    wp_w = Vector((-0.22, -0.02, 0.95))
    pw = base.make_empty("Pivot_WeaponArm_b", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.19, -0.10))
    cg = wp_w + wp_hand
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 1.0, pal)
    # Armillary Sphere Scepter
    wp_parts += [
        base.add_primitive_obj("ab_staff", "cyl", pal["gold"], loc=cg + Vector((0, 0, -0.14)), r_bot=0.018, r_top=0.018, height=0.92, segs=10),
        base.add_primitive_obj("ab_arm_1", "torus", pal["gold"], loc=cg + Vector((0, -0.02, 0.44)), rot=(math.pi * 0.5, 0, 0), r_bot=0.115, r_top=0.015, segs=22),
        base.add_primitive_obj("ab_arm_2", "torus", pal["gold"], loc=cg + Vector((0, -0.02, 0.44)), rot=(0.4, math.pi * 0.4, 0), r_bot=0.092, r_top=0.013, segs=20),
        base.add_primitive_obj("ab_star", "octa", pal["steel"], loc=cg + Vector((0, -0.02, 0.44)), radius=0.052),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_b", wp_parts, wp_w, pw)
    return root


def build_astral_queen(pal):
    root = base.make_empty("Piece_q")
    base.bake_parts_into_joint_mesh("Plinth_q", base.build_plinth_parts(0.36, 0.15, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.14))
    pb = base.make_empty("Pivot_Body_q", body_w, root)
    body_parts = [
        base.add_lathe_obj("aq_gown", [(0, 0.14), (0.28, 0.14), (0.24, 0.40), (0.165, 0.78), (0.20, 1.05), (0.12, 1.15), (0, 1.15)], 16, pal["primary"], flute_amp=0.010, flute_count=8, scale_xyz=(1.04, 0.94, 1.0)),
        base.add_primitive_obj("aq_girdle", "torus", pal["gold"], loc=(0, 0, 0.84), r_bot=0.18, r_top=0.018, segs=24),
        base.add_primitive_obj("aq_wing_l", "box", pal["steel"], loc=(0.18, 0.12, 1.08), rot=(-0.2, 0.35, -0.35), size=(0.024, 0.14, 0.38)),
        base.add_primitive_obj("aq_wing_r", "box", pal["steel"], loc=(-0.18, 0.12, 1.08), rot=(-0.2, -0.35, 0.35), size=(0.024, 0.14, 0.38)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_q", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.15))
    ph = base.make_empty("Pivot_Head_q", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("aq_head", "sphere", pal["primary"], loc=(0, 0, 1.26), radius=0.106, segs=16),
        base.add_primitive_obj("aq_visor", "box", pal["steel"], loc=(0, -0.095, 1.27), size=(0.10, 0.036, 0.024)),
        # Radiant 10-Ray Starburst Dorsal Crown
        base.add_primitive_obj("aq_halo_ring", "torus", pal["gold"], loc=(0, 0.05, 1.38), rot=(math.pi * 0.5, 0, 0), r_bot=0.16, r_top=0.014, segs=24),
    ]
    for i in range(7):
        ang = -0.9 + (i * 1.8 / 6.0)
        head_parts.append(base.add_primitive_obj(f"aq_ray_{i}", "cone", pal["gold"], loc=(math.sin(ang) * 0.18, 0.05, 1.38 + math.cos(ang) * 0.18), rot=(0, ang, 0), r_bot=0.018, height=0.18, segs=6))
    base.bake_parts_into_joint_mesh("Mesh_Head_q", head_parts, head_w, ph)

    sh_w = Vector((0.22, -0.02, 1.08))
    ps = base.make_empty("Pivot_ShieldArm_q", sh_w - body_w, pb)
    sh_hand = Vector((0.03, -0.18, -0.10))
    sh_parts = base.build_armored_arm_parts("left", sh_w, sh_hand, 1.0, pal)
    sh_parts += make_pavise_shield_parts(sh_w + sh_hand + Vector((0.04, -0.03, 0.01)), (0.06, 0, 0.58), 0.24, 0.34, pal, "astral")
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_q", sh_parts, sh_w, ps)

    wp_w = Vector((-0.22, -0.02, 1.08))
    pw = base.make_empty("Pivot_WeaponArm_q", wp_w - body_w, pb)
    wp_hand = Vector((-0.02, -0.18, -0.10))
    tg = wp_w + wp_hand
    wp_parts = base.build_armored_arm_parts("right", wp_w, wp_hand, 1.0, pal)
    wp_parts += [
        base.add_primitive_obj("aq_staff", "cyl", pal["gold"], loc=tg + Vector((0, 0, -0.14)), rot=(0.08, 0, 0), r_bot=0.018, r_top=0.018, height=1.02, segs=10),
        base.add_primitive_obj("aq_crescent", "torus", pal["gold"], loc=tg + Vector((0, -0.04, 0.42)), rot=(math.pi * 0.5, 0, 0), r_bot=0.11, r_top=0.016, segs=20),
        base.add_diamond_blade_obj("aq_blade", 0.36, 0.038, 0.02, 0.025, pal["steel"], loc=tg + Vector((0, -0.04, 0.45)), rot=(0.08, 0, 0)),
    ]
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_q", wp_parts, wp_w, pw)
    return root


def build_astral_king(pal):
    root = base.make_empty("Piece_k")
    base.bake_parts_into_joint_mesh("Plinth_k", base.build_plinth_parts(0.38, 0.16, pal, octagonal=True), Vector((0, 0, 0)), root)

    body_w = Vector((0, 0, 0.15))
    pb = base.make_empty("Pivot_Body_k", body_w, root)
    body_parts = [
        base.add_lathe_obj("ak_armor", [(0, 0.15), (0.295, 0.15), (0.255, 0.40), (0.215, 0.80), (0.245, 1.14), (0.14, 1.30), (0, 1.30)], 16, pal["primary"], scale_xyz=(1.08, 0.90, 1.0), bevel_width=0.010),
        base.add_primitive_obj("ak_belt", "cyl", pal["gold"], loc=(0, 0, 0.83), scale=(1.08, 0.90, 1.0), r_bot=0.228, r_top=0.232, height=0.056, segs=18),
        # Orbital Gyro-Rings behind shoulders
        base.add_primitive_obj("ak_gyro_1", "torus", pal["gold"], loc=(0, 0.18, 1.25), rot=(math.pi * 0.5, 0.35, 0), r_bot=0.38, r_top=0.016, segs=28),
        base.add_primitive_obj("ak_gyro_2", "torus", pal["steel"], loc=(0, 0.18, 1.25), rot=(math.pi * 0.5, -0.35, 0), r_bot=0.32, r_top=0.012, segs=26),
        base.add_primitive_obj("ak_gem", "octa", pal["steel"], loc=(0, -0.23, 1.08), scale=(1.0, 0.45, 1.35), radius=0.058),
    ]
    base.bake_parts_into_joint_mesh("Mesh_Body_k", body_parts, body_w, pb)

    head_w = Vector((0, 0, 1.30))
    ph = base.make_empty("Pivot_Head_k", head_w - body_w, pb)
    head_parts = [
        base.add_primitive_obj("ak_head", "sphere", pal["primary"], loc=(0, 0, 1.425), radius=0.118, segs=16),
        base.add_primitive_obj("ak_visor", "box", pal["steel"], loc=(0, -0.105, 1.445), size=(0.12, 0.04, 0.028)),
        base.add_primitive_obj("ak_crown", "cyl", pal["gold"], loc=(0, 0, 1.52), r_bot=0.125, r_top=0.142, height=0.068, segs=16),
        base.add_primitive_obj("ak_star_spire", "octa", pal["steel"], loc=(0, 0, 1.76), scale=(0.8, 0.8, 1.8), radius=0.068),
    ]
    for i in range(8):
        ang = (i * math.pi) / 4.0
        head_parts.append(base.add_primitive_obj(f"ak_sp_{i}", "cone", pal["gold"], loc=(math.sin(ang) * 0.135, -math.cos(ang) * 0.135, 1.61), rot=(0.12 * math.cos(ang), 0.12 * math.sin(ang), 0), r_bot=0.025, height=0.14, segs=6))
    base.bake_parts_into_joint_mesh("Mesh_Head_k", head_parts, head_w, ph)

    wp_w = Vector((-0.255, -0.03, 1.22))
    pw = base.make_empty("Pivot_WeaponArm_k", wp_w - body_w, pb)
    wp_parts = base.build_armored_arm_parts("right", wp_w, Vector((0.255, -0.23, -0.15)), 1.12, pal)
    wp_parts += base.build_sword_parts(Vector((0.0, -0.26, 1.10)), 0.77, 0.092, 0.32, 0.20, point_down=True, pal=pal)
    base.bake_parts_into_joint_mesh("Mesh_WeaponArm_k", wp_parts, wp_w, pw)

    sh_w = Vector((0.255, -0.03, 1.22))
    ps = base.make_empty("Pivot_ShieldArm_k", sh_w - body_w, pb)
    sh_parts = base.build_armored_arm_parts("left", sh_w, Vector((-0.255, -0.23, -0.09)), 1.12, pal)
    base.bake_parts_into_joint_mesh("Mesh_ShieldArm_k", sh_parts, sh_w, ps)
    return root


ARMY_BUILDERS = {
    "samurai": {
        "p": build_samurai_pawn,
        "r": build_samurai_rook,
        "n": build_samurai_knight,
        "b": build_samurai_bishop,
        "q": build_samurai_queen,
        "k": build_samurai_king,
    },
    "pharaoh": {
        "p": build_pharaoh_pawn,
        "r": build_pharaoh_rook,
        "n": build_pharaoh_knight,
        "b": build_pharaoh_bishop,
        "q": build_pharaoh_queen,
        "k": build_pharaoh_king,
    },
    "astral": {
        "p": build_astral_pawn,
        "r": build_astral_rook,
        "n": build_astral_knight,
        "b": build_astral_bishop,
        "q": build_astral_queen,
        "k": build_astral_king,
    },
}


def render_armies_preview(exported_glbs, out_path: str) -> None:
    """Renders 3 rows (Samurai White, Pharaoh White, Astral Black+White) to visually QA all 3 new armies."""
    base.reset_scene()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.filepath = out_path
    vt_items = [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items]
    scene.view_settings.view_transform = "AgX" if "AgX" in vt_items else "Standard"

    order = ["p", "r", "n", "b", "q", "k"]

    def import_row(glb_path: str, y_pos: float):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=glb_path)
        added = [o for o in bpy.data.objects if o not in before and o.parent is None]
        for idx, pt in enumerate(order):
            m = next((o for o in added if o.name.startswith(f"Piece_{pt}")), None)
            if m:
                m.rotation_mode = "XYZ"
                m.location = ((idx - 2.5) * 1.12, y_pos, 0.0)
                m.rotation_euler = (0.0, 0.0, 0.0)

    import_row(exported_glbs["samurai_w"], -1.35)
    import_row(exported_glbs["pharaoh_w"], 0.10)
    import_row(exported_glbs["astral_b"], 1.55)

    world = bpy.data.worlds.new("ThemePreviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.045, 0.05, 0.075, 1.0)
    bg.inputs["Strength"].default_value = 2.1
    scene.world = world

    base.add_primitive_obj("Floor", "box", base.create_pbr_material("Fl", base_color=(0.11, 0.12, 0.16, 1.0), metallic=0.1, roughness=0.35), loc=(0, 0, -0.05), size=(14.0, 10.0, 0.1))

    def add_light(name, loc, rot, energy, color):
        ld = bpy.data.lights.new(name, type="AREA")
        ld.energy = energy
        ld.color = color
        ld.size = 6.0
        lo = bpy.data.objects.new(name, ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = rot

    add_light("Key", (3.8, -6.5, 6.2), (math.radians(52), 0, math.radians(28)), 520.0, (1.0, 0.92, 0.78))
    add_light("Fill", (-5.5, -4.5, 4.0), (math.radians(58), 0, math.radians(-45)), 260.0, (0.65, 0.78, 1.0))
    add_light("Rim", (0.0, 5.5, 4.8), (math.radians(-50), 0, 0), 360.0, (1.0, 0.80, 0.50))

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 42.0
    cam = bpy.data.objects.new("Cam", cam_d)
    scene.collection.objects.link(cam)
    cam.location = (0.0, -9.8, 3.85)
    cam.rotation_euler = (math.radians(71.5), 0.0, 0.0)
    scene.camera = cam

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.render.render(write_still=True)


def build_all() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    exported = {}
    for army, builders in ARMY_BUILDERS.items():
        for variant in ("w", "b"):
            base.reset_scene()
            pal = build_themed_palette(army, variant)
            roots = [builder(pal) for builder in builders.values()]
            base.select_hierarchy(roots)
            side_name = "white" if variant == "w" else "black"
            out_path = os.path.join(OUT_DIR, f"{army}_{side_name}.glb")
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
            exported[f"{army}_{variant}"] = out_path
            print(f"[EXPORTED] {out_path} ({os.path.getsize(out_path) / 1024.0:.1f} KB)")

    if PREVIEW_PATH:
        render_armies_preview(exported, PREVIEW_PATH)
        print(f"[PREVIEW] {PREVIEW_PATH}")


if __name__ == "__main__":
    build_all()
