eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
w = unreal.EditorLevelLibrary.get_editor_world()
all_acts = eas.get_all_level_actors()
lands = [a for a in all_acts if isinstance(a, unreal.LandscapeProxy)]

with unreal.ScopedEditorTransaction("Kichik pol"):
    # 1) Katta yerni yashirish (o'chirmasdan)
    for a in lands:
        a.modify()
        a.set_actor_hidden_in_game(True)
        a.set_actor_enable_collision(False)
        for c in a.get_components_by_class(unreal.PrimitiveComponent):
            c.modify()
            c.set_visibility(False, True)
    # 2) Kichik pol: 100 m x 100 m, ustki yuzasi Z=100 da
    floor = eas.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(0, 0, 90))
    floor.set_actor_label("Pol")
    smc = floor.static_mesh_component
    smc.set_static_mesh(unreal.load_asset("/Engine/BasicShapes/Cube"))
    smc.set_material(0, unreal.load_asset("/Engine/EngineMaterials/WorldGridMaterial"))
    floor.set_actor_scale3d(unreal.Vector(100, 100, 0.2))
    # 3) PlayerStart ni pol ustiga
    for a in all_acts:
        if isinstance(a, unreal.PlayerStart):
            a.set_actor_location(unreal.Vector(0, 0, 200), False, False)

print("yashirildi:", len(lands))
print("pol:", floor.get_actor_bounds(False))
