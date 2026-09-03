"""Generate the hosted default rival ghosts (ghosts/track_{0,1}.json).

Synthetic: a closed Catmull-Rom spline through each track's gate centres in
sequence, flown at constant SPEED for 3 laps (gate 0 -> ... -> last gate of
lap 3, matching the run timer), sampled at HZ with heading along the path,
nose-down pitch and turn-rate bank. Payload = the ghost sharing v1 format,
uncompressed, as sim.html's hosted-default fetch expects.

Gate lists mirror the addGate() calls in sim.html — keep them in sync.
Stdlib only. Usage: python tools/gen_default_ghosts.py
"""
import json, math, os

TRACKS = {
  0: [(-140,7,-120),(-150,6,-30),(-140,9,55),(-70,24,110),(-25,5.5,70),(0,6,-90),(45,10,-70),(70,12,-50),(0,7,285),(-40,8,-150)],
  1: [(210,8,-345),(490,14,-390),(220,26,-435),(480,40,-480),(350,46,-515),(220,28,-550),(490,16,-585),(350,10,-620),(220,18,-655),(480,12,-680),(350,22,-685),(280,10,-405)],
}
SPEED = {0: 15.0, 1: 15.0}   # m/s average — beatable, not a pushover
HZ = 8                       # poseGhost lerps/slerps between samples; 8 Hz at 15 m/s = ~1.9 m spacing
LAPS = 3
G = 9.81

def add(a,b): return (a[0]+b[0],a[1]+b[1],a[2]+b[2])
def sub(a,b): return (a[0]-b[0],a[1]-b[1],a[2]-b[2])
def mul(a,k): return (a[0]*k,a[1]*k,a[2]*k)
def norm(a): return math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])

def catmull(P, i, t):
    n=len(P); p0,p1,p2,p3=[P[(i+k)%n] for k in (-1,0,1,2)]
    t2,t3=t*t,t*t*t
    out=[]
    for c in range(3):
        out.append(0.5*((2*p1[c])+(-p0[c]+p2[c])*t+(2*p0[c]-5*p1[c]+4*p2[c]-p3[c])*t2+(-p0[c]+3*p1[c]-3*p2[c]+p3[c])*t3))
    return tuple(out)

def quat_mul(a,b):
    ax,ay,az,aw=a; bx,by,bz,bw=b
    return (aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz)
def axis_q(axis,ang):
    s=math.sin(ang/2); return (axis[0]*s,axis[1]*s,axis[2]*s,math.cos(ang/2))
def heading(v):  # yaw that rotates quad-forward (-Z) onto v's horizontal component
    return math.atan2(-v[0],-v[2])

def gen(tid):
    P=TRACKS[tid]; n=len(P); spd=SPEED[tid]
    # dense polyline over 3 laps: gate0 -> ... -> gate(n-1) of lap 3 (run ends on the last gate)
    pts=[]
    total_segs=LAPS*n-1
    for s in range(total_segs):
        for k in range(40):
            pts.append(catmull(P,s%n,k/40))
    pts.append(tuple(float(c) for c in P[total_segs%n]))
    d=[norm(sub(pts[i+1],pts[i])) for i in range(len(pts)-1)]
    cum=[0.0]
    for x in d: cum.append(cum[-1]+x)
    L=cum[-1]; T=L/spd
    samples=[]; t=0.0; idx=0
    while t<=T+1e-9:
        s=min(t*spd,L)
        while idx<len(d)-1 and cum[idx+1]<s: idx+=1
        f=(s-cum[idx])/d[idx] if d[idx]>0 else 0
        p=add(pts[idx],mul(sub(pts[idx+1],pts[idx]),f))
        # heading from a short window either side
        v=sub(pts[min(idx+3,len(pts)-1)],pts[max(idx-3,0)])
        if abs(v[0])+abs(v[2])<1e-6: v=(0,0,-1.0)
        yaw=heading(v)
        # bank from turn rate over a wider window
        pa=pts[max(idx-8,0)]; pb=pts[min(idx+8,len(pts)-1)]
        ha=heading(sub(pts[idx],pa)); hb=heading(sub(pb,pts[idx]))
        dyaw=(hb-ha+math.pi)%(2*math.pi)-math.pi
        arc=norm(sub(pb,pa))
        omega=dyaw/(arc/spd) if arc>0 else 0
        bank=max(-1.1,min(1.1,math.atan(omega*spd/G)))
        pitch=-0.35-0.1*abs(bank)   # nose down when fast / turning
        q=quat_mul(axis_q((0,1,0),yaw),quat_mul(axis_q((0,0,1),bank),axis_q((1,0,0),pitch)))
        r2=lambda x:round(float(x),2); r3=lambda x:round(float(x),3)
        samples.append([int(round(t*1000)),r2(p[0]),r2(p[1]),r2(p[2]),r3(q[0]),r3(q[1]),r3(q[2]),r3(q[3])])
        t+=1.0/HZ
    return {"v":1,"track":tid,"lapTime":int(round(T*1000)),"name":"RyFly","samples":samples}, L, T

if __name__=="__main__":
    root=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..")
    for tid in (0,1):
        payload,L,T=gen(tid)
        out=os.path.join(root,"ghosts",f"track_{tid}.json")
        os.makedirs(os.path.dirname(out),exist_ok=True)
        body=json.dumps(payload,separators=(',',':'))
        with open(out,"w",newline="\n") as fh: fh.write(body+"\n")
        print(f"track {tid}: path {L:.0f} m, run {T:.1f}s (lap ~{T/3:.1f}s), {len(payload['samples'])} samples, {len(body)//1024} KB")
