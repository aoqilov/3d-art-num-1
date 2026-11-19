eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
ar = unreal.AssetRegistryHelpers.get_asset_registry()
A = ar.get_assets_by_path('/Game', recursive=False)
meshes = [unreal.load_asset(str(a.package_name)) for a in A
          if str(a.asset_class_path.asset_name) == 'StaticMesh']

# Umumiy o'lcham (vertexlar dunyo koordinatasida saqlangan)
mn = [1e18] * 3
mx = [-1e18] * 3
for m in meshes:
    bb = m.get_bounding_box()
    for i, k in enumerate('xyz'):
        mn[i] = min(mn[i], getattr(bb.min, k))
        mx[i] = max(mx[i], getattr(bb.max, k))
print('uy min', [round(v) for v in mn], 'max', [round(v) for v in mx])

FLOOR_TOP = 100.0
off = unreal.Vector(-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, FLOOR_TOP - mn[2])
sx = (mx[0] - mn[0]) / 100.0
sy = (mx[1] - mn[1]) / 100.0

with unreal.ScopedEditorTransaction("Uyni joylash va yorug'lik"):
    acts = eas.get_all_level_actors()
    existing = {}
    for a in acts:
        if isinstance(a, unreal.StaticMeshActor) and a.static_mesh_component.static_mesh:
            existing[a.static_mesh_component.static_mesh.get_path_name()] = a
    n = 0
    for m in meshes:
        a = existing.get(m.get_path_name())
        if a is None:
            a = eas.spawn_actor_from_object(m, off)
            n += 1
        a.set_actor_location(off, False, False)
        a.set_actor_rotation(unreal.Rotator(0, 0, 0), False)
        a.set_actor_scale3d(unreal.Vector(1, 1, 1))
        a.set_folder_path('Uy')

    # Pol: uydan har tomonga ~10 m kattaroq
    for a in acts:
        if a.get_actor_label() == 'Pol':
            a.set_actor_scale3d(unreal.Vector(sx + 20, sy + 20, 0.2))
            a.set_actor_location(unreal.Vector(0, 0, FLOOR_TOP - 10), False, False)

    # Yorug'lik va osmon
    def add(cls, label, loc=(0, 0, 0), rot=(0, 0, 0)):
        x = eas.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(*rot))
        x.set_actor_label(label)
        x.set_folder_path('Yorugʻlik')
        return x
    sun = add(unreal.DirectionalLight, 'Quyosh', (0, 0, 1000), (0, -45, -30))
    sun.light_component.set_editor_property('atmosphere_sun_light', True)
    sun.light_component.set_intensity(10.0)
    sky = add(unreal.SkyLight, 'SkyLight', (0, 0, 500))
    sky.light_component.set_editor_property('real_time_capture', True)
    add(unreal.SkyAtmosphere, 'SkyAtmosphere')
    add(unreal.ExponentialHeightFog, 'Tuman', (0, 0, 100))
    add(unreal.VolumetricCloud, 'Bulutlar')
    ps = eas.spawn_actor_from_class(unreal.PlayerStart,
                                    unreal.Vector(0, -(mx[1] - mn[1]) / 2 - 500, FLOOR_TOP + 100),
                                    unreal.Rotator(0, 0, 90))
    ps.set_actor_label('PlayerStart')

print('yangi qo\'yildi:', n, 'jami qism:', len(meshes))
print('pol o\'lchami (m):', round(sx + 20), 'x', round(sy + 20))
