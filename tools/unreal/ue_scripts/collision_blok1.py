# Walkable block: every Blok1 mesh collides with its real triangles (complex as simple) so the player stands on floors,
# climbs the stair steps and is stopped by walls, doors, glass and railings. Nanite meshes collide with their fallback,
# so the fallback keeps all triangles. Safe to re-run (import_blok1.py runs it after every import).
import unreal

reg = unreal.AssetRegistryHelpers.get_asset_registry()
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
n = 0
for a in reg.get_assets_by_path("/Game/Blok1/Full", recursive=True):
    if str(a.asset_class_path.asset_name) != "StaticMesh":
        continue
    m = a.get_asset()
    name = m.get_name()
    walk = not name.endswith(("_Lattice", "_Signs", "_DecorD"))      # thin ornament: no collision needed
    bs = m.get_editor_property("body_setup")
    if bs is None:
        continue
    bs.set_editor_property("collision_trace_flag",
                           unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE if walk else unreal.CollisionTraceFlag.CTF_USE_SIMPLE_AS_COMPLEX)
    ns = sms.get_nanite_settings(m)
    if ns.enabled and walk:
        ns.fallback_percent_triangles = 1.0
        ns.fallback_relative_error = 0.0
        sms.set_nanite_settings(m, ns, apply_changes=True)
    m.set_editor_property("body_setup", bs)
    n += 1
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for act in eas.get_all_level_actors():
    if act.get_actor_label().startswith("Blok1_") and isinstance(act, unreal.StaticMeshActor):
        c = act.static_mesh_component
        if act.get_actor_label().endswith(("_Lattice", "_Signs", "_DecorD")):
            # the importer wrapped these in one bounding box: an invisible wall through the rooms -> no collision at all
            c.set_collision_profile_name("NoCollision")
            c.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
            continue
        c.set_collision_profile_name("BlockAll")
        c.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
print("collision set on", n, "meshes")
