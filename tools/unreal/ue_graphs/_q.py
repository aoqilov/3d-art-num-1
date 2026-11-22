import unreal
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
b2 = [a for a in eas.get_all_level_actors() if a.get_actor_label().startswith("Blok2_Q")]
print(len(b2), sorted(set(a.get_actor_label()[10:] for a in b2))[:40])
m = b2[0].static_mesh_component.static_mesh
bs = m.get_editor_property("body_setup")
print(m.get_name(), bs.get_editor_property("collision_trace_flag") if bs else None)
lbl=[a.get_actor_label() for a in eas.get_all_level_actors() if "Stair" in a.get_actor_label() or "Zina" in a.get_actor_label()]
print(len(lbl), lbl[:10])
