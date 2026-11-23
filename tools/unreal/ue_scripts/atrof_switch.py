# Surroundings switch (owner 2026-11-22): MODE = "shahar" (the real city, folder Kompleks/Shahar) or "ormon" (the
# forest, folder Kompleks/Ormon, forest_setup.py). Shows one, hides the other (in the game and the editor) and moves the
# walkable collision with it. Lights inside the hidden folder go dark with their actors.
#   In Unreal: Tools -> Execute Python Script... is not needed — ask Claude, or run in the Python console:
#   MODE = "ormon"; exec(open(r"C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/ue_scripts/atrof_switch.py").read())
import unreal
MODE = globals().get("MODE", "shahar")
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
COLLIDE = {"Kompleks_Urban_Urban_Terrain", "Kompleks_Urban_Urban_Roads", "Kompleks_Urban_urban_walls_mesh", "Kompleks_Ormon_Terrain",
           "Kompleks_UrbanLamps", "Kompleks_UrbanSvetofor", "Kompleks_UrbanBekat", "Kompleks_UrbanMahallaLamps"}
n = {"shahar": 0, "ormon": 0}
with unreal.ScopedEditorTransaction("Atrof: " + MODE):
    for a in eas.get_all_level_actors():
        f = str(a.get_folder_path())
        kind = "shahar" if f.startswith("Kompleks/Shahar") else "ormon" if f.startswith("Kompleks/Ormon") else None
        if not kind: continue
        show = kind == MODE
        a.modify(); a.set_actor_hidden_in_game(not show); a.set_is_temporarily_hidden_in_editor(not show)
        if a.get_actor_label() in COLLIDE: a.set_actor_enable_collision(show)
        n[kind] += 1
print("atrof:", MODE, n)
