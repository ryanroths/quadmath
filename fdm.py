#!/usr/bin/env python3
"""
fdm.py — minimal quad rigid-body FDM for Betaflight SITL.

  gamepad ----> rc_packet  ----> UDP :9004 ----> SITL
  physics ----> fdm_packet ----> UDP :9003 ----> SITL
  SITL    ----> servo_packet --> UDP :9002 ----> physics

Frames (Gazebo bridge, SITL default):
  body  = FRD  (X fwd, Y right, Z down)
  world = NED  (Z down, gravity +Z)
  gyro  = rad/s FRD
  accel = specific force m/s^2 FRD  (hover = 0,0,-9.81)
  quat  = w,x,y,z body->world

Motors (BF Quad-X): 0=RR 1=FR 2=RL 3=FL. Spin (props-in default): RR CW, FR CCW, RL CCW, FL CW.

Usage:
  pip install pygame
  python3 fdm.py            # SITL must already be running
  python3 fdm.py --axes     # print gamepad axes to find mapping
"""
import math, socket, struct, sys, time

# ---------------- airframe (75mm whoop-ish; swap in quadmath physics values) ----------------
MASS      = 0.032      # kg
IXX = IYY = 1.2e-5     # kg m^2
IZZ       = 2.0e-5
ARM       = 0.037      # m, motor-to-center
THRUST_MAX_PER_MOTOR = 0.20   # N at motor=1.0  (4 motors -> ~2.5:1 TWR)
TORQUE_COEFF = 0.004          # yaw torque per N thrust
DRAG_LIN  = 0.015      # N per (m/s)^2 roughly
DRAG_ANG  = 2e-6       # Nm per (rad/s)^2
MOTOR_TAU = 0.015      # s, motor spin-up lag
G = 9.80665
DT = 1.0 / 1000.0      # 1 kHz physics step
GROUND_Z = 0.0         # NED z of ground (quad starts here)

# ---------------- gamepad mapping (edit after running --axes) ----------------
AX_ROLL, AX_PITCH, AX_THR, AX_YAW = 0, 1, 2, 3
INV_ROLL, INV_PITCH, INV_THR, INV_YAW = 1, -1, 1, 1
ARM_BUTTON = 0         # aux1 = 2000 while held/toggled

# ---------------- UDP ----------------
SITL_IP = "172.17.255.78"
PORT_STATE, PORT_RC, PORT_PWM = 9003, 9004, 9002
FDM_FMT = "<18d"       # fdm_packet: 18 doubles, 144 bytes
RC_FMT  = "<d16H"      # rc_packet:  double + 16 uint16, 40 bytes
PWM_FMT = "<4f"        # servo_packet: 4 floats

# ---------------- quaternion helpers (w,x,y,z) ----------------
def q_mul(a, b):
    aw, ax, ay, az = a; bw, bx, by, bz = b
    return (aw*bw - ax*bx - ay*by - az*bz,
            aw*bx + ax*bw + ay*bz - az*by,
            aw*by - ax*bz + ay*bw + az*bx,
            aw*bz + ax*by - ay*bx + az*bw)

def q_norm(q):
    n = math.sqrt(sum(c*c for c in q)); return tuple(c/n for c in q)

def q_rot(q, v):   # rotate body vector v into world
    w, x, y, z = q
    vq = (0.0, *v)
    r = q_mul(q_mul(q, vq), (w, -x, -y, -z))
    return r[1:]

def q_rot_inv(q, v):  # world -> body
    w, x, y, z = q
    return q_rot((w, -x, -y, -z), v)

# ---------------- state ----------------
pos = [0.0, 0.0, GROUND_Z]
vel = [0.0, 0.0, 0.0]
q   = (1.0, 0.0, 0.0, 0.0)
omega = [0.0, 0.0, 0.0]          # body rates FRD rad/s
motor_cmd = [0.0]*4              # from SITL
motor_act = [0.0]*4              # after lag
acc_body = [0.0, 0.0, -G]

def step():
    global q
    # motor lag
    for i in range(4):
        motor_act[i] += (motor_cmd[i] - motor_act[i]) * (DT / MOTOR_TAU)
    T = [m * THRUST_MAX_PER_MOTOR for m in motor_act]   # N, each along body -Z
    # geometry: RR(+x?,) — FRD: front = +x, right = +y
    #   RR: x=-ARM y=+ARM   FR: x=+ARM y=+ARM   RL: x=-ARM y=-ARM   FL: x=+ARM y=-ARM
    k = ARM * 0.7071
    roll_t  = k * (-T[0] - T[1] + T[2] + T[3])     # +roll = right wing down: left motors up
    pitch_t = k * ( T[0] - T[1] + T[2] - T[3])     # +pitch = nose up: rear motors up
    # yaw: reaction torque opposite prop spin. CW prop -> body yaws CCW (-z in FRD)
    #   RR CW(-), FR CCW(+), RL CCW(+), FL CW(-)
    yaw_t   = TORQUE_COEFF * (-T[0] + T[1] + T[2] - T[3])
    # angular drag
    tq = [roll_t  - DRAG_ANG*omega[0]*abs(omega[0]),
          pitch_t - DRAG_ANG*omega[1]*abs(omega[1]),
          yaw_t   - DRAG_ANG*omega[2]*abs(omega[2])]
    omega[0] += tq[0]/IXX * DT
    omega[1] += tq[1]/IYY * DT
    omega[2] += tq[2]/IZZ * DT
    # integrate attitude
    dq = (0.0, omega[0]*0.5*DT, omega[1]*0.5*DT, omega[2]*0.5*DT)
    q = q_norm(q_mul(q, (1.0, dq[1], dq[2], dq[3])))
    # forces world
    thrust_body = (0.0, 0.0, -sum(T))
    f_world = list(q_rot(q, thrust_body))
    f_world[2] += MASS * G
    for i in range(3):
        f_world[i] -= DRAG_LIN * vel[i] * abs(vel[i])
    a_world = [f/MASS for f in f_world]
    # ground contact
    on_ground = pos[2] >= GROUND_Z and a_world[2] > 0
    if on_ground:
        pos[2] = GROUND_Z; vel[:] = [0.0, 0.0, 0.0]; omega[:] = [0.0, 0.0, 0.0]
        a_world = [0.0, 0.0, 0.0]
    for i in range(3):
        vel[i] += a_world[i]*DT; pos[i] += vel[i]*DT
    # specific force in body: a - g, then to body
    sf_world = (a_world[0], a_world[1], a_world[2] - G)
    acc_body[:] = q_rot_inv(q, sf_world)

# ---------------- gamepad ----------------
def init_pad():
    import pygame
    pygame.init(); pygame.joystick.init()
    if pygame.joystick.get_count() == 0:
        sys.exit("no gamepad / radio detected")
    j = pygame.joystick.Joystick(0); j.init()
    print(f"pad: {j.get_name()} axes={j.get_numaxes()} buttons={j.get_numbuttons()}")
    return pygame, j

def read_rc(pygame, j, armed):
    pygame.event.pump()
    def ch(ax, inv): return int(1500 + inv * j.get_axis(ax) * 500)
    thr = int(1500 + INV_THR * j.get_axis(AX_THR) * 500)
    chans = [ch(AX_ROLL, INV_ROLL), ch(AX_PITCH, INV_PITCH), thr, ch(AX_YAW, INV_YAW)] + [1000]*12
    chans[4] = 2000 if armed else 1000
    return [max(1000, min(2000, c)) for c in chans]

def main():
    if "--axes" in sys.argv:
        pygame, j = init_pad()
        while True:
            pygame.event.pump()
            print(" ".join(f"{j.get_axis(i):+.2f}" for i in range(j.get_numaxes())),
                  " btn:", "".join(str(j.get_button(b)) for b in range(j.get_numbuttons())), end="\r")
            time.sleep(0.05)
    pygame, j = init_pad()
    tx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    rx.bind(("0.0.0.0", PORT_PWM)); rx.setblocking(False)
    t0 = time.perf_counter(); sim_t = 0.0; armed = False; last_btn = 0; n = 0
    print("running. arm button toggles AUX1. Ctrl-C to quit.")
    while True:
        # drain motor packets
        try:
            while True:
                data, _ = rx.recvfrom(64)
                if len(data) == 16:
                    motor_cmd[:] = struct.unpack(PWM_FMT, data)
        except BlockingIOError:
            pass
        step(); sim_t += DT; n += 1
        # send state every step
        pkt = struct.pack(FDM_FMT, sim_t,
                          omega[0], -omega[1], omega[2],
                          acc_body[0], acc_body[1], acc_body[2],
                          q[0], q[1], q[2], q[3],
                          vel[0], vel[1], vel[2],
                          pos[0], pos[1], pos[2],
                          101325.0)
        tx.sendto(pkt, (SITL_IP, PORT_STATE))
        # RC + print at 100 Hz
        if n % 10 == 0:
            btn = j.get_button(ARM_BUTTON)
            if btn and not last_btn: armed = not armed
            last_btn = btn
            chans = read_rc(pygame, j, armed)
            tx.sendto(struct.pack(RC_FMT, sim_t, *chans), (SITL_IP, PORT_RC))
        if n % 200 == 0:
            print(f"t={sim_t:6.1f} alt={-pos[2]:6.2f}m m={[round(m,2) for m in motor_cmd]} "
                  f"w={[round(w,1) for w in omega]} armed={armed}", end="\r")
        # real-time pacing
        target = t0 + sim_t
        while time.perf_counter() < target: pass

if __name__ == "__main__":
    main()
