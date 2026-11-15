// Creates the new Unreal project D:/3d-aps/ObodMaskanUE2 (ObodMaskan2.uproject) — empty, scripted from outside.
//   node tools/ue2/new_project.mjs        (re-runnable: rewrites the .uproject and Config, keeps Content)
// Renderer settings are those of the first project (ObodMaskanUE): the same shader permutations, so the shared
// shader cache (%LOCALAPPDATA%/UnrealEngine/Common/DerivedDataCache) is reused and the first start is short.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const UE_ROOT = process.env.UE_ROOT || 'D:/UE_5.8';
export const PROJ = process.env.UE2 || 'D:/3d-aps/ObodMaskanUE2';
export const UPROJECT = join(PROJ, 'ObodMaskan2.uproject');
const LEVEL = '/Game/Blok1/Blok1_Sinov.Blok1_Sinov';

const uproject = {
  FileVersion: 3,
  EngineAssociation: '{D0A526BA-4E32-C5BF-D42C-0EB2F2490F19}',     // D:/UE_5.8 (as registered for the first project)
  Category: '',
  Description: "Obod Maskan — qayta qurish: Blender'dan toza model (1-blok), Lumen + Nanite",
  Plugins: [
    { Name: 'InterchangeEditor', Enabled: true, SupportedTargetPlatforms: ['Win64'] },
    { Name: 'PythonScriptPlugin', Enabled: true },
    { Name: 'EditorScriptingUtilities', Enabled: true },
    { Name: 'SequencerScripting', Enabled: true },
    { Name: 'SunPosition', Enabled: true },
    { Name: 'ModelingToolsEditorMode', Enabled: true },
    { Name: 'MovieRenderPipeline', Enabled: true },
    { Name: 'MoviePipelineMaskRenderPass', Enabled: true },
    { Name: 'LidarPointCloud', Enabled: false },
    { Name: 'ElectraPlayer', Enabled: false },
  ],
};

const engine = `[/Script/HardwareTargeting.HardwareTargetingSettings]
TargetedHardwareClass=Desktop
AppliedTargetedHardwareClass=Desktop
DefaultGraphicsPerformance=Maximum
AppliedDefaultGraphicsPerformance=Maximum

[/Script/Engine.RendererSettings]
; same as ObodMaskanUE (shader cache), Lumen GI + reflections, virtual shadow maps, Substrate
r.Tonemapper.Sharpen=2
r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange=True
r.EyeAdaptation.CachedLightingPreExposure=8
r.LightPropagationVolume=0
r.ReflectionCaptureResolution=2048
r.AllowStaticLighting=True
r.HighResScreenshotDelay=48
r.DefaultBackBufferPixelFormat=4
r.AllowGlobalClipPlane=False
r.SupportSkyAtmosphereAffectsHeightFog=True
r.DefaultFeature.LensFlare=True
r.ClearCoatNormal=False
r.NormalMapsForStaticLighting=False
r.VirtualTextures=True
r.VirtualTexturedLightmaps=True
r.ReflectionMethod=1
r.GenerateMeshDistanceFields=True
r.DynamicGlobalIlluminationMethod=1
r.SkinCache.CompileShaders=True
r.RayTracing=True
r.PathTracing=True
r.RayTracing.Shadows=True
r.Shadow.Virtual.Enable=1
r.RayTracing.UseTextureLod=True
r.Lumen.HardwareRayTracing=True
r.Lumen.TraceMeshSDF=1
r.RayTracing.Geometry.InstancedStaticMeshes.Culling=0
r.Substrate=True
r.Substrate.ProjectGBufferFormat=1
r.MinRoughnessOverride=0.02

[/Script/EngineSettings.GameMapsSettings]
EditorStartupMap=${LEVEL}
GameDefaultMap=${LEVEL}
GlobalDefaultGameMode=/Script/Engine.GameModeBase

[/Script/WindowsTargetPlatform.WindowsTargetSettings]
DefaultGraphicsRHI=DefaultGraphicsRHI_DX12
-D3D12TargetedShaderFormats=PCD3D_SM5
+D3D12TargetedShaderFormats=PCD3D_SM6
-D3D11TargetedShaderFormats=PCD3D_SM5
+D3D11TargetedShaderFormats=PCD3D_SM5

[/Script/PythonScriptPlugin.PythonScriptPluginSettings]
; Claude sends Python to the open editor (tools/unreal/ue.py, remote_execution.py from the plugin)
bRemoteExecution=True
bDeveloperMode=False

[/Script/EngineSettings.GeneralProjectSettings]
ProjectName=Obod Maskan 2
CompanyName=Obod Maskan
`;

const throttle = `[/Script/UnrealEd.EditorPerformanceSettings]
; keep rendering when the editor is behind other windows (screenshots are taken from outside)
bThrottleCPUWhenNotForeground=False
`;

const editor = `[/Script/UnrealEd.LevelEditorViewportSettings]
bInvertMiddleMousePan=True
bUseDistanceScaledCameraSpeed=True
`;

const scalability = `[ScalabilitySettings]
PerfIndexValues_ResolutionQuality="50 71 75 75 100"

[ShadowQuality@Cine]
r.Shadow.Virtual.NonNanite.IncludeInCoarsePages=1

[TextureQuality@3]
r.Streaming.PoolSize=2000
`;

mkdirSync(join(PROJ, 'Config'), { recursive: true });
mkdirSync(join(PROJ, 'Content'), { recursive: true });
mkdirSync(join(PROJ, 'Import'), { recursive: true });
mkdirSync(join(PROJ, 'Renders'), { recursive: true });
writeFileSync(UPROJECT, JSON.stringify(uproject, null, '\t'));
writeFileSync(join(PROJ, 'Config/DefaultEngine.ini'), engine);
writeFileSync(join(PROJ, 'Config/DefaultEditorSettings.ini'), throttle);
writeFileSync(join(PROJ, 'Config/DefaultEditorPerProjectUserSettings.ini'), throttle);
writeFileSync(join(PROJ, 'Config/DefaultEditor.ini'), editor);
writeFileSync(join(PROJ, 'Config/DefaultScalability.ini'), scalability);
writeFileSync(join(PROJ, 'Config/DefaultGame.ini'), '[/Script/EngineSettings.GeneralProjectSettings]\nProjectName=Obod Maskan 2\n');
writeFileSync(join(PROJ, 'Ochish.bat'), `@echo off\r\nstart "" "${UE_ROOT.replace(/\//g, '\\')}\\Engine\\Binaries\\Win64\\UnrealEditor.exe" "%~dp0ObodMaskan2.uproject"\r\n`);
console.log('project', UPROJECT);
