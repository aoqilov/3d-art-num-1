# Runs a Python file (or a one-line statement) inside the open Unreal Editor and prints what it printed.
# Uses the editor's remote execution (Project Settings > Python > Enable Remote Execution; on in ObodMaskanUE).
#   D:/UE_5.8/Engine/Binaries/ThirdParty/Python3/Win64/python.exe tools/unreal/ue.py tools/unreal/ue_build.py
#   ... ue.py -c "print(unreal.SystemLibrary.get_engine_version())"
import os
import sys
import time

sys.path.append(os.environ.get('UE_ROOT', 'D:/UE_5.8') + '/Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python')
import remote_execution as rx  # noqa: E402


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__ or 'usage: ue.py file.py [args] | -c "statement"')
        return 2
    if args[0] == '-c':
        mode, cmd = rx.MODE_EXEC_STATEMENT, ' '.join(args[1:])
        if 'import unreal' not in cmd:
            cmd = 'import unreal; ' + cmd
        mode = rx.MODE_EXEC_FILE  # a statement with ';' runs fine as a file-mode snippet
    else:
        path = os.path.abspath(args[0]).replace('\\', '/')
        mode, cmd = rx.MODE_EXEC_FILE, ' '.join([path] + args[1:])
    r = rx.RemoteExecution()
    r.start()
    try:
        t0 = time.time()
        while not r.remote_nodes and time.time() - t0 < 15:
            time.sleep(0.2)
        if not r.remote_nodes:
            print('No editor found (is it open, with remote execution on?)')
            return 1
        r.open_command_connection(r.remote_nodes[0]['node_id'])
        res = r.run_command(cmd, unattended=True, exec_mode=mode, raise_on_failure=False)
        for o in res.get('output', []):
            sys.stdout.write(o.get('output', '') + ('\n' if not o.get('output', '').endswith('\n') else ''))
        if not res.get('success'):
            print('FAILED:', res.get('result'))
            return 1
        return 0
    finally:
        r.stop()


if __name__ == '__main__':
    sys.exit(main())
