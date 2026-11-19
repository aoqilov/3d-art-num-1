import unreal
M = "/Game/Characters/Mannequins/"
bp = unreal.load_asset("/Game/Blok1/Player/BP_Blok1Player")
cdo = unreal.get_default_object(bp.generated_class())
cdo.set_editor_property("BoyiSm", 176.0)
cdo.set_editor_property("YelkaSm", 46.0)
m = cdo.get_editor_property("mesh")
m.set_editor_property("skeletal_mesh_asset", unreal.load_asset(M + "Meshes/SKM_Manny_Simple"))
m.set_editor_property("animation_mode", unreal.AnimationMode.ANIMATION_BLUEPRINT)
m.set_editor_property("anim_class", unreal.load_asset(M + "Anims/Unarmed/ABP_Unarmed").generated_class())
m.set_editor_property("relative_location", unreal.Vector(0, 0, -88))
m.set_editor_property("relative_rotation", unreal.Rotator(0, 0, -90))   # (roll, pitch, yaw): mesh faces +X
m.set_editor_property("relative_scale3d", unreal.Vector(1, 176 / 180.5, 176 / 180.5))
m.set_editor_property("owner_no_see", True)        # first person: shadow only
m.set_editor_property("cast_hidden_shadow", True)
m.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
mv = cdo.get_editor_property("character_movement")
mv.set_editor_property("rotation_rate", unreal.Rotator(0, 0, 540))
# old static figure: no mesh, hidden
sub = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
BFL = unreal.SubobjectDataBlueprintFunctionLibrary
for h in sub.k2_gather_subobject_data_for_blueprint(bp):
    d = BFL.get_data(h)
    if str(BFL.get_variable_name(d)) == "Body":
        o = BFL.get_object(d); o.set_editor_property("static_mesh", None); o.set_editor_property("visible", False); o.set_editor_property("cast_shadow", False)
unreal.BlueprintEditorLibrary.compile_blueprint(bp)
cdo = unreal.get_default_object(bp.generated_class())
m = cdo.get_editor_property("mesh")
print("mesh", m.get_editor_property("skeletal_mesh_asset").get_name(), "anim", m.get_editor_property("anim_class").get_name(), "rot", m.get_editor_property("relative_rotation"), "h", cdo.get_editor_property("BoyiSm"), "w", cdo.get_editor_property("YelkaSm"))
print("saved", unreal.EditorAssetLibrary.save_loaded_asset(bp, False))
