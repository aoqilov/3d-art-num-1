// D3: render LS_Aylanma (ue_scripts/flythrough_setup.py) with Movie Render Queue (PIE executor) to JPG frames in
// tools/unreal/out/renders/D3_video/frames, then the caller joins them into an mp4 (OpenCV).
// node flythrough_render.mjs [WxH]
import { init, py } from './ue.mjs';
await init();
const [RES = '1920x1080'] = process.argv.slice(2); const [W, H] = RES.split('x').map(Number);
const OUT = 'C:/Users/user/Desktop/3esd/3d-art-num-1/tools/unreal/out/renders/D3_video/frames';
console.log(String(await py(`import unreal
sub = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
q = sub.get_queue()
for j in list(q.get_jobs()): q.delete_job(j)
job = q.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.sequence = unreal.SoftObjectPath("/Game/Kompleks/Video/LS_Aylanma.LS_Aylanma")
job.map = unreal.SoftObjectPath(unreal.EditorLevelLibrary.get_editor_world().get_path_name().split(":")[0])
cfg = job.get_configuration()
o = cfg.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
o.output_resolution = unreal.IntPoint(${W}, ${H}); o.output_directory = unreal.DirectoryPath("${OUT}")
o.file_name_format = "{frame_number}"; o.override_existing_output = True
cfg.find_or_add_setting_by_class(unreal.MoviePipelineDeferredPassBase)
cfg.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_JPG)
aa = cfg.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
aa.spatial_sample_count = 1; aa.temporal_sample_count = 4
aa.render_warm_up_count = 64; aa.engine_warm_up_count = 64
ex = sub.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
print("render started", job.map, ex)`)).trim());
