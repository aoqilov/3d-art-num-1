# Courtyard ground: swap the Poly Haven textures of the M_GP_Surface instances (ground_import.py) for free Fab / Quixel
# Megascans surfaces added with the editor's Fab window (2026-11-21): Asphalt Fresh, Smooth Precast Concrete (curb),
# Decorative Patterned Pavers, Lawn Grass. Only the texture / tile / tint parameters change; the ground mesh stays.
# Run after ground_import.py (which resets the instances to Poly Haven). Megascans ORM = AO / roughness / metal, like ARM;
# normals are DirectX already.
import unreal
EAL = unreal.EditorAssetLibrary; MEL = unreal.MaterialEditingLibrary
S = "/Game/Fab/Megascans/Surfaces/"
FAB = {  # set -> texture path prefix (+ B / N / ORM)
    "Asphalt": S + "Asphalt_Fresh_sfrofg0a/Medium/sfrofg0a_tier_2/Textures/T_sfrofg0a_2K_",
    "Curb": S + "Smooth_Precast_Concrete_sekjcawb/Medium/sekjcawb_tier_2/Textures/T_sekjcawb_2K_",
    "Pavers": S + "Decorative_Patterned_Pavers_vl4kfhwfw/Medium/vl4kfhwfw_tier_2/Textures/T_vl4kfhwfw_2K_",
    "Lawn": S + "Lawn_Grass_tkynejer/High/tkynejer_tier_1/Textures/T_tkynejer_4K_",
}
# instance -> (set, tile metres = the scan size, tint, roughness scale); play / sport / fountain keep their look
# (tints from the 2026-11-21 shots: raw pavers glared white in the sun, the curb read brown, the lawn khaki)
LOOK = {"MI_GP_Asphalt": ("Asphalt", 2.0, (1.25, 1.25, 1.3), 1.0), "MI_GP_Gate": ("Asphalt", 2.0, (0.15, 0.15, 0.16), 0.8),
        "MI_GP_Curb": ("Curb", 2.0, (0.78, 0.8, 0.86), 1.0), "MI_GP_Pavers": ("Pavers", 3.0, (0.62, 0.6, 0.58), 1.0),
        "MI_GP_Soil": ("Lawn", 2.0, (0.72, 1.0, 0.55), 1.0)}
done = []
for name, (key, tm, tn, rsc) in LOOK.items():
    mi = unreal.load_asset("/Game/Kompleks/Mat/" + name)
    for p, k in (("Albedo", "B"), ("Normal", "N"), ("ARM", "ORM")):
        t = unreal.load_asset(FAB[key] + k)
        if t is None: raise RuntimeError("missing " + FAB[key] + k)
        MEL.set_material_instance_texture_parameter_value(mi, p, t)
    MEL.set_material_instance_scalar_parameter_value(mi, "TileM", tm)
    MEL.set_material_instance_scalar_parameter_value(mi, "RoughScale", rsc)
    MEL.set_material_instance_vector_parameter_value(mi, "Tint", unreal.LinearColor(*tn, 1))
    MEL.update_material_instance(mi); EAL.save_loaded_asset(mi, False); done.append(name)
print("ground fab ok", done)
