import os, subprocess, time
git = 'C:/Users/其叶蓁蓁/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe'
repo = 'C:/wbtest/m2560/deploy_workbench'

def run(args):
    return subprocess.run([git, '-C', repo] + args, capture_output=True, text=True, timeout=180)

# status
st = run(['--no-pager', 'status', '-s'])
print('STATUS:\n' + st.stdout + (st.stderr[:200] if st.stderr else ''))

# add
run(['add', '-A'])
print('added')

# commit
msg = 'fix(life): 加版本徽标+材料自动候选置顶 便于确认缓存是否刷新 v140'
c = run(['-c', 'core.autocrlf=input', 'commit', '-m', msg])
print('COMMIT rc=%d' % c.returncode, (c.stdout+c.stderr)[:300])

# push with retries (proxy can 502)
for i in range(1, 5):
    p = run(['push', 'origin', 'main'])
    print('PUSH attempt %d rc=%d' % (i, p.returncode))
    if p.returncode == 0:
        print('PUSH OK:', p.stdout.strip()[:200])
        break
    print('  err:', p.stderr.strip()[:200])
    if i < 4:
        time.sleep(6)
