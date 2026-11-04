"""Representative screw-and-nut cutaway assembly for a future backlash lab.

Run headless (CPU only):
    blender -b --factory-startup --python build_model.py -- --out OUTDIR [--no-render] [--cols N]

CourseWiki copy: identical to the preserved prototype script except for the optional --cols argument
(columns per helical turn, default 192 = the prototype). The web asset is built with --cols 96, which halves
the delivered geometry; dimensions, clearance, nodes and materials are unchanged. With the default the
script reproduces the prototype GLB byte for byte (sha256 a59025189aad3f957b47dcb7f7075071077b9be8fc80d168a7407edf85843b9c).

Everything is generated procedurally from the parameters below; no external or vendor assets.
Dimensions are ILLUSTRATIVE (a representative mechanism), not a standard thread form, fit or
manufacturing CAD. Blender units are metres (glTF convention); parameters are written in mm.

Coordinate frame (Blender, Z-up): screw axis = +X, up = +Z, viewer/front = -Y.
glTF export converts to Y-up: glTF (x, y, z) = Blender (x, z, -y); screw axis stays +X.
"""
import bpy, bmesh, math, json, os, sys, hashlib, time
# Ubuntu's blender 4.0.2 package does not pull in numpy for its Python 3.12, and the bundled glTF
# exporter needs it. A pinned numpy 1.26.4 is installed into ./pydeps (pip --target), owned here.
_PYDEPS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pydeps")
if os.path.isdir(_PYDEPS) and _PYDEPS not in sys.path:
    sys.path.insert(0, _PYDEPS)
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(os.path.dirname(__file__), "out")
DO_RENDER = "--no-render" not in argv
PREVIEW = "--preview" in argv  # quick low-sample half-size renders for framing checks
COLS = int(argv[argv.index("--cols") + 1]) if "--cols" in argv else 192  # columns per helical turn; web delivery uses fewer
os.makedirs(OUT, exist_ok=True)
MM = 0.001  # mm -> m

# ---------------- parameters (mm, degrees) ----------------
P = dict(
    lead=5.0,                 # single start, so pitch == lead
    starts=1,
    handedness="right",
    major_d=20.0,
    minor_d=16.0,             # thread depth 2.0
    flank_half_angle_deg=15.0,  # 30 deg included, trapezoid-like (illustrative, not ISO/ACME)
    axial_clearance=1.0,      # total axial play between flanks (exaggerated for visibility)
    radial_clearance=0.25,    # crest/root radial clearance each side
    thread_x=(-70.0, 70.0),
    nut_length=32.0,
    nut_od=34.0,
    carriage_len=24.0,
    cut_quadrant_deg=(90.0, 180.0),  # removed sector of nut + carriage (front-top, -Y/+Z)
    cols_per_turn=COLS,
)
L = P["lead"]
Rmaj, Rmin = P["major_d"] / 2, P["minor_d"] / 2
h = Rmaj - Rmin
Rmid = (Rmaj + Rmin) / 2
ta = math.tan(math.radians(P["flank_half_angle_deg"]))
B = P["axial_clearance"]
cr = P["radial_clearance"]
wm = L / 2 - B / 2            # tooth width at mid-depth, screw and nut alike
c = L / 2                     # screw tooth centre phase
# screw profile: phase (mm along helix, period L) -> radius
scr_ph = [c - (wm + h * ta) / 2, c - (wm - h * ta) / 2, c + (wm - h * ta) / 2, c + (wm + h * ta) / 2]
scr_r = [Rmin, Rmaj, Rmaj, Rmin]
Rn_c, Rn_r = Rmin + cr, Rmaj + cr   # nut crest (inner) and root radii
def n_left(r):  # nut tooth left flank, parallel to screw right flank, offset B/2 axially
    return c + L / 2 - wm / 2 + (Rmid - r) * ta
m_ = c + L / 2
a1, a2 = n_left(Rn_r), n_left(Rn_c)
nut_pts = sorted([(a1 % L, Rn_r), (a2 % L, Rn_c), ((2 * m_ - a2) % L, Rn_c), ((2 * m_ - a1) % L, Rn_r)])
nut_ph = [p for p, _ in nut_pts]
nut_r = [r for _, r in nut_pts]

def profile(phase_list, radii, x):
    """periodic piecewise-linear radius at axial phase x (mm, any real)."""
    ph = np.array([phase_list[-1] - L] + list(phase_list) + [phase_list[0] + L])
    rr = np.array([radii[-1]] + list(radii) + [radii[0]])
    return np.interp(np.mod(x, L), np.concatenate([ph - L, ph, ph + L]), np.concatenate([rr, rr, rr]))

def r_screw(x, th):  # right-hand helix: constant phase along x = L*th/2pi + const
    return profile(scr_ph, scr_r, x - L * th / (2 * math.pi))

def r_nut(x, th, dx=0.0):  # nut displaced axially by dx relative to its neutral (centred) phase
    return profile(nut_ph, nut_r, x - dx - L * th / (2 * math.pi))

# ---------------- helpers ----------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m

def helical_grid(phases, radii, x0, x1, th0, th1, ncols):
    """Columns of (x, r) samples at constant helix phases, clamped to [x0, x1].
    Returns list over columns of list over k of (x, r, th)."""
    base = [L * (th0 + (th1 - th0) * i / ncols) / (2 * math.pi) for i in range(ncols + 1)]
    mmin = math.floor((x0 - max(base)) / L) - 2
    mmax = math.ceil((x1 - min(base)) / L) + 2
    cols = []
    for i in range(ncols + 1):
        th = th0 + (th1 - th0) * i / ncols
        col = []
        for m in range(mmin, mmax + 1):
            for j, p in enumerate(phases):
                x = base[i] + m * L + p
                r = radii[j]
                if x < x0 or x > x1:
                    x = min(max(x, x0), x1)
                    r = float(profile(phases, radii, x - base[i]))
                col.append((x, r, th))
        cols.append(col)
    return cols

def xyz(x, r, th):
    return (x * MM, r * math.cos(th) * MM, r * math.sin(th) * MM)

def finish_mesh(name, verts, faces, mats_idx, materials, smooth_deg=35):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    for f, mi in zip(me.polygons, mats_idx):
        f.material_index = mi
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-8)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for m in materials:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, "use_auto_smooth"):  # Blender <= 4.0
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(smooth_deg)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

def cyl_mesh(r, xa, xb, n=64):
    v, f = [], []
    for i in range(n):
        t = 2 * math.pi * i / n
        v += [(xa * MM, r * math.cos(t) * MM, r * math.sin(t) * MM), (xb * MM, r * math.cos(t) * MM, r * math.sin(t) * MM)]
    for i in range(n):
        a, b2, cc, d = 2 * i, 2 * i + 1, 2 * ((i + 1) % n) + 1, 2 * ((i + 1) % n)
        f.append((a, d, cc, b2))
    f.append(tuple(2 * i for i in reversed(range(n))))
    f.append(tuple(2 * i + 1 for i in range(n)))
    return v, f

def box_obj(name, x, y, z, material=None):
    me = bpy.data.meshes.new(name)
    X, Y, Z = [(a * MM, b * MM) for a, b in (x, y, z)]
    vs = [(X[i], Y[j], Z[k]) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
    fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me.from_pydata(vs, [], fs)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    if material: me.materials.append(material)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def cyl_obj(name, r, xa, xb, material=None, n=64):
    v, f = cyl_mesh(r, xa, xb, n)
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    if material: me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    if hasattr(me, "use_auto_smooth"):
        me.use_auto_smooth = True; me.auto_smooth_angle = math.radians(35)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def bake(ob):
    """Apply modifiers through the evaluated depsgraph (headless-safe)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data; ob.modifiers.clear(); ob.data = me; me.name = ob.name
    bpy.data.meshes.remove(old)

def boolean(ob, cutter, op="DIFFERENCE"):
    md = ob.modifiers.new("bool_" + cutter.name, "BOOLEAN")
    md.operation = op; md.object = cutter; md.solver = "EXACT"
    if hasattr(md, "material_mode"): md.material_mode = "TRANSFER"
    bake(ob)
    bpy.data.objects.remove(cutter, do_unlink=True)

def join(objs, name):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name; objs[0].data.name = name
    return objs[0]

# ---------------- build ----------------
t_start = time.time()
clear_scene()
sc = bpy.context.scene
sc.unit_settings.system = "METRIC"; sc.unit_settings.scale_length = 1.0; sc.unit_settings.length_unit = "MILLIMETERS"

M = dict(
    steel=mat("Steel_Screw", (0.62, 0.63, 0.66), 1.0, 0.28),
    bronze=mat("Bronze_Nut", (0.62, 0.36, 0.14), 1.0, 0.38),
    bronze_cut=mat("Nut_SectionFace", (0.95, 0.42, 0.10), 0.0, 0.6),
    carriage=mat("Carriage_AnodizedBlue", (0.04, 0.14, 0.48), 0.4, 0.4),
    carriage_cut=mat("Carriage_SectionFace", (0.45, 0.60, 0.85), 0.0, 0.65),
    frame=mat("Frame_DarkGray", (0.16, 0.16, 0.18), 0.3, 0.55),
    dial=mat("Dial_Aluminium", (0.85, 0.86, 0.88), 1.0, 0.4),
    marker=mat("PhaseMarker_Red", (0.85, 0.04, 0.03), 0.0, 0.45),
)

# --- screw thread (closed solid, full 360 deg) ---
x0, x1 = P["thread_x"]
ncol = P["cols_per_turn"]
cols = helical_grid(scr_ph, scr_r, x0, x1, 0.0, 2 * math.pi, ncol)
K = len(cols[0])
verts, faces = [], []
idx = lambda i, k: i * K + k
for col in cols:
    verts += [xyz(*p) for p in col]
for i in range(ncol):
    for k in range(K - 1):
        faces.append((idx(i, k), idx(i, k + 1), idx(i + 1, k + 1), idx(i + 1, k)))
ca = len(verts); verts.append((x0 * MM, 0, 0))
cb = len(verts); verts.append((x1 * MM, 0, 0))
for i in range(ncol):
    faces.append((ca, idx(i + 1, 0), idx(i, 0)))
    faces.append((cb, idx(i, K - 1), idx(i + 1, K - 1)))
thread = finish_mesh("ScrewThread", verts, faces, [0] * len(faces), [M["steel"]])

journal_l = cyl_obj("JournalL", 6.0, -108.0, x0 + 0.5, M["steel"])
journal_r = cyl_obj("JournalR", 6.0, x1 - 0.5, 93.0, M["steel"])
collar_a = cyl_obj("ThrustCollarA", 10.0, -94.0, -89.2, M["steel"])
collar_b = cyl_obj("ThrustCollarB", 10.0, -74.8, -71.0, M["steel"])
dial = cyl_obj("Dial", 24.0, -114.0, -108.0, M["dial"], n=96)
marker = box_obj("PhaseMarker", (-114.6, -107.4), (-2.0, 2.0), (17.0, 24.6), M["marker"])
screw = join([thread, journal_l, journal_r, collar_a, collar_b, dial, marker], "Screw")

# --- nut (bronze, internal thread, quarter cutaway, closed solid) ---
nx0, nx1 = -P["nut_length"] / 2, P["nut_length"] / 2
Ro = P["nut_od"] / 2
q0, q1 = [math.radians(a) for a in P["cut_quadrant_deg"]]
th_a, th_b = q1, q0 + 2 * math.pi           # keep 180 -> 450 deg, i.e. remove 90..180
ncn = int(round(ncol * (th_b - th_a) / (2 * math.pi)))
cin = helical_grid(nut_ph, nut_r, nx0, nx1, th_a, th_b, ncn)
Kn = len(cin[0])
verts, faces, mi = [], [], []
I = lambda i, k: i * Kn + k                      # inner surface
O = lambda i, k: (ncn + 1) * Kn + i * Kn + k     # outer surface
for col in cin: verts += [xyz(*p) for p in col]
for col in cin: verts += [xyz(x, Ro, th) for (x, r, th) in col]
for i in range(ncn):
    for k in range(Kn - 1):
        faces.append((I(i, k), I(i + 1, k), I(i + 1, k + 1), I(i, k + 1))); mi.append(0)
        faces.append((O(i, k), O(i, k + 1), O(i + 1, k + 1), O(i + 1, k))); mi.append(0)
    faces.append((I(i, 0), O(i, 0), O(i + 1, 0), I(i + 1, 0))); mi.append(0)
    faces.append((I(i, Kn - 1), I(i + 1, Kn - 1), O(i + 1, Kn - 1), O(i, Kn - 1))); mi.append(0)
for i in (0, ncn):
    for k in range(Kn - 1):
        faces.append((I(i, k), I(i, k + 1), O(i, k + 1), O(i, k))); mi.append(1)
nut = finish_mesh("Nut", verts, faces, mi, [M["bronze"], M["bronze_cut"]])

# --- carriage (anodised block holding the nut, slotted over a guide rail; same cutaway) ---
cl = P["carriage_len"] / 2
carriage = box_obj("Carriage", (-cl, cl), (-30.0, 30.0), (-37.0, 26.0), M["carriage"])
bore = cyl_obj("CarriageBore", Ro, -cl - 5, cl + 5, M["carriage"], n=128)
boolean(carriage, bore)
slot = box_obj("CarriageSlot", (-cl - 5, cl + 5), (-6.3, 6.3), (-40.0, -27.7), M["carriage"])
boolean(carriage, slot)
quad = box_obj("CarriageCut", (-cl - 5, cl + 5), (-40.0, 0.0), (0.0, 40.0), M["carriage_cut"])
boolean(carriage, quad)
for p in carriage.data.polygons: p.use_smooth = False

# --- frame (static): base plate, bearing blocks, anti-rotation guide rail ---
base = box_obj("Base", (-122.0, 102.0), (-38.0, 38.0), (-47.0, -41.0), M["frame"])
rail = box_obj("GuideRail", (-74.0, 74.0), (-6.0, 6.0), (-41.0, -28.0), M["frame"])
blocks = []
for nm, xc in (("BearingBlockL", -82.0), ("BearingBlockR", 82.0)):
    b = box_obj(nm, (xc - 7.0, xc + 7.0), (-20.0, 20.0), (-41.0, 18.0), M["frame"])
    boolean(b, cyl_obj(nm + "Bore", 6.15, xc - 10, xc + 10, M["frame"]))
    blocks.append(b)
for o in (base, rail, *blocks):
    for p in o.data.polygons: p.use_smooth = False
frame = join([base, rail, *blocks], "Frame")

# --- hierarchy and metadata ---
root = bpy.data.objects.new("BacklashAssembly", None); sc.collection.objects.link(root)
for o in (frame, screw, carriage): o.parent = root
nut.parent = carriage
root["units"] = "metres (glTF); design values in mm"
root["representative_only"] = "Illustrative dimensions; not a standard thread form, fit or manufacturing CAD"
root["axes"] = "screw axis +X; Blender Z-up / glTF Y-up; front = Blender -Y = glTF +Z"
screw["role"] = "rotates about local +X only; axially fixed by thrust collars at BearingBlockL"
screw["lead_mm"] = L; screw["handedness"] = "right"
carriage["role"] = "translates along +X only; nonrotating (slot over GuideRail); carries Nut"
nut["role"] = "rigid child of Carriage; internal thread engages Screw"
frame["role"] = "static frame: base, bearing blocks, guide rail"
sc["build_params_json"] = json.dumps(P)

# ---------------- geometric clearance check (analytic radius maps) ----------------
xs = np.linspace(nx0 + 0.01, nx1 - 0.01, 4001)
ths = np.linspace(0, 2 * math.pi, 73)
def min_gap(dx):
    g = np.inf
    for t in ths:
        g = min(g, float(np.min(r_nut(xs, t, dx) - r_screw(xs, t))))
    return g
gap_checks = {f"{dx:+.3f}": round(min_gap(dx), 5) for dx in (0.0, B / 2, -B / 2, B / 2 + 0.05, -B / 2 - 0.05, B / 4)}

# ---------------- export GLB at neutral (centred) state ----------------
for o in bpy.context.selected_objects: o.select_set(False)
glb = os.path.join(OUT, "assembly.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_yup=True, export_apply=True,
                          export_extras=True, export_cameras=False, export_lights=False, use_selection=False)

def world_bounds(obs):
    pts = []
    for o in obs:
        if o.type != "MESH": continue
        mw = o.matrix_world
        a = np.array([tuple(mw @ v.co) for v in o.data.vertices])
        pts.append(a)
    a = np.vstack(pts)
    return a.min(0).tolist(), a.max(0).tolist(), bool(np.isfinite(a).all()), int(len(a))

bmin, bmax, finite, nverts = world_bounds([frame, screw, carriage, nut])
mesh_stats = {o.name: dict(vertices=len(o.data.vertices), faces=len(o.data.polygons)) for o in (frame, screw, carriage, nut)}

# ---------------- cameras, lights, renders ----------------
def look_at(ob, target):
    from mathutils import Vector
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

world = bpy.data.worlds.new("World"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.78, 0.80, 0.84, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
def light(name, kind, loc, energy, size=None, rot=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy
    if size and kind == "AREA": ld.size = size
    lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo); lo.location = loc
    look_at(lo, (0, 0, 0)); return lo
light("Key", "AREA", (-0.25, -0.35, 0.40), 2.5, 0.3)
light("Fill", "AREA", (0.35, -0.20, 0.15), 0.8, 0.4)
light("Rim", "AREA", (0.10, 0.35, 0.30), 1.0, 0.3)
sun = light("Sun", "SUN", (0.1, -0.2, 1), 0.8)

cam_d = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_d); sc.collection.objects.link(cam)
sc.camera = cam
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 16 if PREVIEW else 160
sc.cycles.use_denoising = False   # this Ubuntu build has no OpenImageDenoise
sc.render.resolution_x, sc.render.resolution_y = (800, 450) if PREVIEW else (1600, 900)
sc.render.image_settings.file_format = "PNG"
sc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"

seat = B / 2  # carriage displaced +X by B/2 from centred phase: driven toward -X by the screw
renders = {}
def render(path, loc, target, lens, carriage_dx):
    carriage.location.x = carriage_dx * MM
    cam.location = loc; look_at(cam, target); cam_d.lens = lens
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    renders[os.path.basename(path)] = dict(seconds=round(time.time() - t, 1), carriage_dx_mm=carriage_dx,
                                           camera_m=list(loc), target_m=list(target), lens_mm=lens,
                                           engine=sc.render.engine, device=sc.cycles.device,
                                           samples=sc.cycles.samples, denoise=sc.cycles.use_denoising)
if DO_RENDER:
    render(os.path.join(OUT, "render_overall.png"), (-0.13, -0.30, 0.21), (-0.006, 0.0, -0.010), 40, 0.0)
    render(os.path.join(OUT, "render_cutaway_closeup.png"), (0.040, -0.110, 0.095), (0.0, -0.003, 0.003), 66, seat)
carriage.location.x = 0.0

blend = os.path.join(OUT, "assembly.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)

# ---------------- specification + build record ----------------
spec = {
    "title": "Representative lead-screw / nut cutaway for a backlash lab (scratch proof)",
    "status": "Representative mechanism with illustrative dimensions. NOT a standard thread form (not ISO metric trapezoidal, ACME or any catalogue part), not a fit specification, not manufacturing CAD.",
    "units": {"design_values": "mm", "blender_and_gltf": "metres (1 unit = 1 m); glTF spec units"},
    "axes": {
        "blender": "Z-up, right-handed. Screw axis +X. Front/viewer side -Y.",
        "gltf": "Y-up, right-handed (exporter conversion glTF(x,y,z) = Blender(x,z,-y)). Screw axis +X, up +Y, front +Z.",
        "screw_axis_point_m": [0, 0, 0],
    },
    "thread": {
        "starts": 1, "lead_mm": L, "pitch_mm": L / P["starts"], "handedness": "right",
        "major_diameter_mm": P["major_d"], "minor_diameter_mm": P["minor_d"], "depth_mm": h,
        "flank_half_angle_deg": P["flank_half_angle_deg"], "included_angle_deg": 2 * P["flank_half_angle_deg"],
        "tooth_width_at_mid_depth_mm": wm,
        "screw_profile_phase_mm_radius_mm": [[round(a, 4), b] for a, b in zip(scr_ph, scr_r)],
        "nut_profile_phase_mm_radius_mm": [[round(a, 4), b] for a, b in zip(nut_ph, nut_r)],
        "phase_convention": "radius(x, theta) = profile((x - lead*theta/(2*pi)) mod lead); theta measured from +Y toward +Z (Blender) about +X. Constant-phase lines are right-hand helices.",
        "threaded_length_x_mm": list(P["thread_x"]),
    },
    "clearance": {
        "proposed_total_axial_clearance_mm": B,
        "note_axial": "Exaggerated for visibility (roughly 5x what a tidy small lead screw might show); a lab could rebuild with another value via build_model.py.",
        "axial_gap_each_flank_when_centred_mm": B / 2,
        "radial_clearance_crest_and_root_mm": cr,
        "nut_seated_offsets_mm": {"+B/2": "carriage pushed toward -X (screw driving -X): contact on nut flanks facing +X, gap B on the others",
                                   "-B/2": "carriage pushed toward +X: opposite flanks in contact"},
        "analytic_min_radial_gap_mm_by_nut_offset_mm": gap_checks,
        "analytic_check_meaning": "min over nut length and 73 angles of (nut radius - screw radius). >0 clear, ~0 flank contact, <0 interference. Expect +0.25 centred, 0 at +/-B/2, negative beyond.",
    },
    "kinematics": {
        "screw_derived_travel": "s = -lead * phi / (2*pi), phi = screw rotation about +X (right-hand rule), i.e. positive phi moves an engaged nut toward -X (right-hand thread).",
        "carriage_position_with_backlash": "c follows s with a dead band of width B: if s - c > B/2 then c = s - B/2; if s - c < -B/2 then c = s + B/2; otherwise c is unchanged.",
        "assumptions": "Rigid parts, no elastic deflection, nothing moves the carriage except flank contact (friction holds it during the dead band; no gravity or external load along X). Not a force, friction, dynamics or safety model.",
        "neutral_state_in_glb": "Screw rotation 0, Carriage translation 0, nut centred in the clearance (gap B/2 on both flanks).",
    },
    "nodes": {
        "BacklashAssembly": "root empty; holds metadata extras",
        "Frame": "static: base plate, two bearing blocks, anti-rotation guide rail",
        "Screw": "rotates about local +X only; thread, journals, thrust collars at left bearing block (axial fixing), dial with red phase marker",
        "Carriage": "translates along +X only; nonrotating (slot over guide rail); quarter cutaway; parent of Nut",
        "Nut": "bronze nut with internal thread; rigid child of Carriage; quarter cutaway exposing flanks; section faces use a lighter material",
    },
    "dimensions_mm": {
        "nut_length": P["nut_length"], "nut_outside_diameter": P["nut_od"], "carriage_length_x": P["carriage_len"],
        "carriage_block_y": [-30, 30], "carriage_block_z": [-37, 26], "journal_diameter": 12, "dial_diameter": 48,
        "bearing_block_centres_x": [-82, 82], "base_plate_x": [-122, 102],
        "cutaway_removed_sector_deg": list(P["cut_quadrant_deg"]),
        "full_engagement_carriage_x_range": [x0 + P["nut_length"] / 2, x1 - P["nut_length"] / 2],
    },
    "materials": [m.name for m in M.values()],
    "limits": [
        "Illustrative dimensions and exaggerated clearance; no tolerances, thread standard or fit class.",
        "Thread surfaces are faceted (" + str(COLS) + " columns/turn); thread ends are clamped flat at the end planes, not chamfered or run out.",
        "Bearings are represented by plain bores; the right bearing is a simple support. No balls, keys, fasteners or lubrication.",
        "Nut press-fit in carriage is shown as coincident surfaces, not a modelled fit.",
        "Contact is geometric only (coincident flanks in the seated state); no contact mechanics, friction, preload or deflection.",
        "Kinematic backlash rule above is a teaching assumption, not a measured behaviour.",
    ],
    "source": "Generated by build_model.py in this directory; no vendor or third-party geometry.",
}
with open(os.path.join(OUT, "specification.json"), "w") as f:
    json.dump(spec, f, indent=2)
rec = dict(blender_version=bpy.app.version_string, blender_binary=bpy.app.binary_path, build_hash=bpy.app.build_hash.decode() if isinstance(bpy.app.build_hash, bytes) else bpy.app.build_hash,
           python=sys.version.split()[0], background=bpy.app.background, seconds_total=round(time.time() - t_start, 1),
           world_bounds_m_blender=dict(min=bmin, max=bmax), all_vertices_finite=finite, vertex_count=nverts,
           mesh_stats=mesh_stats, renders=renders, analytic_gap_checks_mm=gap_checks)
with open(os.path.join(OUT, "build_record.json"), "w") as f:
    json.dump(rec, f, indent=2)
print("BUILD_DONE", json.dumps(rec))
