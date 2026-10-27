---
title: "Lecture 13: Robotics"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has two Robotics tasks: **Diffusion Policy**, the loop that samples a robot's next moves
by removing noise step by step (RSS 2023); and **MuJoCo Playground**, a training recipe that teaches
a four-legged robot to follow joystick commands in twelve minutes of GPU time (RSS 2025). For each,
these notes explain the paper's idea, the part the task asks for, how a run is judged, and what the
agents did.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). The task
statements are the public ones an agent reads; the Push-T reward and the Go1 reward terms are from
the public source trees in those statements. Nothing here comes from the hidden workloads or the
human reference patches. The blog has no Robotics case study yet.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. The "about 360 million steps"
for Claude Opus 5.5 on MuJoCo Playground is the run's own estimate, quoted by the task page. The
toys (a one-number action with two good values, a two-legged walker on a line, their timings and
seeds) are ours.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Explain why averaging demonstrations fails when there are two good ways to act, and how denoising
   avoids it.
2. Run a denoising sampler and explain what each call to the network contributes.
3. Explain how a sampler can use 5 network calls instead of 100, and why the placement of the calls
   matters.
4. Write a reward for following a commanded velocity, and train a small policy by trial and error.
5. Explain why a recipe that uses the whole time budget can still fail a "beat it everywhere" rule.

# Diffusion Policy: actions from noise

A robot policy maps what the robot sees to what it does next. The usual way to learn one from
human demonstrations is regression: predict the demonstrated action, with the squared error as the
loss. *Diffusion Policy* (Chi et al., RSS 2023) instead learns to **generate** actions the way image
models generate pictures: start from random noise and remove it step by step, with a trained
network guiding each step. The paper's point is that demonstrations are often **multimodal**: people
solve the same situation in different ways, and regression averages those ways into one that nobody
used.

## Two good ways around an obstacle

Our toy has a one-number action. An obstacle stands straight ahead; the demonstrators steer around
it to the left (action −1) or to the right (+1), with a little spread. A regression policy learns
the mean of the demonstrations.

```python
from math import cos, exp, log, pi, sqrt


class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def next(self):
        self.state = self.state * 48271 % 2147483647
        return self.state

    def uniform(self):
        return self.next() / 2147483647

    def gauss(self):
        """A standard normal sample (Box-Muller)."""
        u1, u2 = self.uniform(), self.uniform()
        return sqrt(-2 * log(u1)) * cos(2 * pi * u2)


MODES, SPREAD = (-1.0, 1.0), 0.1   # steer left or right, give or take 0.1

rng = Rng(5)
demos = [MODES[rng.next() % 2] + SPREAD * rng.gauss() for _ in range(200)]
total = 0.0
for a in demos:
    total += a
average = total / len(demos)
near = [a for a in demos if abs(a - average) < 0.3]
print(f"average action {average:.3f}; demonstrations within 0.3 of it: {len(near)}")
```

```{.text .output}
average action 0.112; demonstrations within 0.3 of it: 0
```

The regression answer, 0.112, steers almost straight into the obstacle. No demonstrator did that.

## Denoising, one step at a time

Diffusion training adds noise to demonstrated actions at many levels `t`, from 0 (clean) to 100
(pure noise). At level `t` a clean action `a` becomes `x = sqrt(ab) · a + sqrt(1 − ab) · noise`,
where `ab` (alpha-bar) falls from 1 to 0 along a **schedule**; Diffusion Policy uses the cosine
schedule below. The network learns to guess the clean action from `x` and `t`.

We skip the training and use the best possible guess, which for our two-mode data can be written in
closed form: the expected clean action given `x`. A trained network approximates this function.

```python
T = 100   # noise levels, as in the paper's training


def alpha_bar(t):
    """Cosine schedule: the share of signal left at noise level t."""
    f = lambda u: cos((u / T + 0.008) / 1.008 * pi / 2) ** 2
    return f(t) / f(0)


AB = [alpha_bar(t) for t in range(T + 1)]


def denoise(x, t):
    """The best guess of the clean action from noisy x at level t (what the network learns)."""
    ab = AB[t]
    var = ab * SPREAD ** 2 + 1 - ab
    num = den = 0.0
    for mu in MODES:
        weight = exp(-((x - sqrt(ab) * mu) ** 2) / (2 * var))
        num += weight * (mu + sqrt(ab) * SPREAD ** 2 / var * (x - sqrt(ab) * mu))
        den += weight
    return num / den


for t in (100, 80, 60, 40, 20):
    print(f"level {t:3}: signal share {AB[t]:.3f}, guess from x = 0.3 is {denoise(0.3, t):+.3f}")
```

```{.text .output}
level 100: signal share 0.000, guess from x = 0.3 is +0.000
level  80: signal share 0.094, guess from x = 0.3 is +0.102
level  60: signal share 0.341, guess from x = 0.3 is +0.260
level  40: signal share 0.647, guess from x = 0.3 is +0.583
level  20: signal share 0.899, guess from x = 0.3 is +0.934
```

At full noise, the best guess is the average of the two modes, 0: the regression answer for
balanced demonstrations. As the noise
falls, the guess commits to the nearer mode. A sampler exploits this: it starts from pure noise,
asks for a guess, moves the sample a little toward it, adds back a little fresh noise, and repeats
at the next lower level. This is the **DDPM** sampler; the authors' loop takes all 100 steps, one
network call each.

```python
def ddpm(levels, rng):
    """Ancestral sampling down the given noise levels, one network call per level."""
    x = rng.gauss()
    for t, s in zip(levels, levels[1:] + [0]):
        guess = denoise(x, t)
        if s == 0:
            return guess
        beta = 1 - AB[t] / AB[s]
        mean = (sqrt(AB[s]) * beta * guess + sqrt(1 - beta) * (1 - AB[s]) * x) / (1 - AB[t])
        x = mean + sqrt(beta * (1 - AB[s]) / (1 - AB[t])) * rng.gauss()


def tally(samples):
    left = len([a for a in samples if abs(a + 1) < 0.3])
    right = len([a for a in samples if abs(a - 1) < 0.3])
    return {"left": left, "right": right, "middle": len(samples) - left - right}


ALL = list(range(T, 0, -1))   # 100, 99, ..., 1
rng = Rng(9)
print("100 calls:", tally([ddpm(ALL, rng) for _ in range(1000)]))
```

```{.text .output}
100 calls: {'left': 478, 'right': 522, 'middle': 0}
```

Of 1,000 sampled actions, about half go left and half go right, and none goes into the obstacle.
The robot then executes the first few actions of the plan and samples again.

# Diffusion Policy: fewer network calls

A hundred network calls per plan are slow. On the task's CPU, the authors' sampler takes 1,150 ms
per prediction. Most of that work is spent at high noise levels, where the guess barely changes.

## A deterministic shortcut

The **DDIM** update drops the fresh noise. It splits the current sample into a clean guess and the
noise that the guess implies, then rebuilds the sample at a much lower level with the same noise.
The levels can then be far apart. `levels(k)` spreads `k` calls evenly.

```python
def ddim(levels, rng):
    """Deterministic jumps between the given levels, one network call per level."""
    x = rng.gauss()
    for t, s in zip(levels, levels[1:] + [0]):
        guess = denoise(x, t)
        if s == 0:
            return guess
        noise = (x - sqrt(AB[t]) * guess) / sqrt(1 - AB[t])
        x = sqrt(AB[s]) * guess + sqrt(1 - AB[s]) * noise


def levels(k):
    return [round(T - i * T / k) for i in range(k)]


for k in (1, 2, 3, 5, 10, 20):
    rng = Rng(9)
    print(f"{k:2} calls {str(levels(k)[:5]):22}", tally([ddim(levels(k), rng) for _ in range(1000)]))
```

```{.text .output}
 1 calls [100]                  {'left': 0, 'right': 0, 'middle': 1000}
 2 calls [100, 50]              {'left': 199, 'right': 183, 'middle': 618}
 3 calls [100, 67, 33]          {'left': 387, 'right': 355, 'middle': 258}
 5 calls [100, 80, 60, 40, 20]  {'left': 499, 'right': 448, 'middle': 53}
10 calls [100, 90, 80, 70, 60]  {'left': 526, 'right': 472, 'middle': 2}
20 calls [100, 95, 90, 85, 80]  {'left': 526, 'right': 473, 'middle': 1}
```

One call returns the guess at full noise, which is the average again: all 1,000 samples go into the
obstacle. Ten calls are already about as good as a hundred.

## Where the calls go, and a second-order step

With few calls, placement matters. Evenly spaced levels waste calls at the top of the cosine
schedule, where almost no signal is left, and stop at level 20, where the last guess is still
blurred. A **second-order** update (DPM-Solver++) also reuses the previous guess: it measures the
jump in log signal-to-noise ratio `lam` and extrapolates from the last two guesses, at no extra
network call.

```python
def lam(t):
    return 0.5 * log(AB[t] / (1 - AB[t]))


def dpm2(levels, rng):
    """Second-order multistep jumps: each one combines the current and the previous guess."""
    x, prev = rng.gauss(), None
    for i, (t, s) in enumerate(zip(levels, levels[1:] + [0])):
        guess = denoise(x, t)
        if s == 0:
            return guess
        h = lam(s) - lam(t)
        d = guess
        if prev is not None:
            r = (lam(t) - lam(levels[i - 1])) / h
            d = (1 + 1 / (2 * r)) * guess - prev / (2 * r)
        prev = guess
        x = sqrt(1 - AB[s]) / sqrt(1 - AB[t]) * x + sqrt(AB[s]) * (1 - exp(-h)) * d


RUNS = [
    ("even, first order", ddim, levels(3)),
    ("placed, first order", ddim, [95, 50, 10]),
    ("even, first order", ddim, levels(5)),
    ("placed, first order", ddim, [95, 70, 45, 22, 5]),
    ("placed, second order", dpm2, [95, 70, 45, 22, 5]),
]
for name, sampler, lv in RUNS:
    rng = Rng(9)
    print(f"{name:20} {str(lv):22}", tally([sampler(lv, rng) for _ in range(1000)]))
```

```{.text .output}
even, first order    [100, 67, 33]          {'left': 387, 'right': 355, 'middle': 258}
placed, first order  [95, 50, 10]           {'left': 504, 'right': 452, 'middle': 44}
even, first order    [100, 80, 60, 40, 20]  {'left': 499, 'right': 448, 'middle': 53}
placed, first order  [95, 70, 45, 22, 5]    {'left': 498, 'right': 448, 'middle': 54}
placed, second order [95, 70, 45, 22, 5]    {'left': 517, 'right': 460, 'middle': 23}
```

Three well-placed calls beat three even ones by a wide margin, and the second-order step halves the
misses of five calls. The levels 95, 70, 45, 22 and 5 are the ones Claude Opus 5.5 chose (see below).
In our toy, "middle" is a miss; in the task, a blurred plan pushes the T-block less accurately.

## What the agent writes

The task removes the body of `conditional_sample`, the sampling loop. The trained transformer, the
normalization, the observation window and the controller around the loop stay fixed. The agent
decides how many denoising steps to take (at least 1 and at most 200 network calls per prediction),
where to place them and how each step updates the sample. The loop must keep one contract: the
entries of the plan fixed by the observations (selected by `condition_mask`) must come back
unchanged, and every entry must be finite. The statement's own example:

```python
def respects_mask(data, mask, result):
    return all(r == d for d, m, r in zip(data, mask, result) if m) and all(r == r for r in result)


print(respects_mask([1.0, 2.0, 3.0], [True, False, True], [1.0, 0.5, 3.0]),
      respects_mask([1.0, 2.0, 3.0], [True, False, True], [0.0, 0.5, 3.0]))
```

```{.text .output}
True False
```

(`r == r` is false only for NaN.) Fixing the seed, looking up answers for known starting states or
inspecting the environment is forbidden; the sampler runs in a separate process that can only ask
for network evaluations and fresh random numbers.

## How it is judged

A simulated robot pushes a T-shaped block into a target region (**Push-T**). Each episode runs at
most 300 control steps; the controller observes 2 steps, plans 10 and executes 8 before planning
again. The reward of a step is the share of the target the block covers, divided by 0.95 and capped
at 1; an episode succeeds when the coverage passes 95%. Candidate and reference get the same
episodes and the same diffusion seeds, three repetitions per condition, on 2 CPUs.

To **pass**, on every group of episodes the sampler must match or beat the authors' 100-step sampler
on mean best reward and on success rate, and be strictly faster both per prediction and for the
whole run. The **score** is separate. It compares each workload with a "naive" anchor, a plain
20-step DDPM sampler measured on the same machine (`Qn`, `Ln`, `Tn` below): quality gained over the
anchor, times the worse of two speed ratios.

```python
def utility(q, latency, wall, qn, ln, tn):
    gain = max(0.0, (q - qn) / (1 - qn))
    return gain * min(ln / latency, tn / wall)


def final_score(utilities):
    u = 0.0
    for x in utilities:
        u += x
    u /= len(utilities)
    return 100 * u / (1 + u)


# our numbers: an anchor with reward 0.80, 230 ms and 20 s, against three candidate samplers
for q, latency, wall in [(0.92, 1150, 52), (0.92, 60, 12), (0.80, 40, 10)]:
    u = utility(q, latency, wall, 0.80, 230, 20)
    print(f"reward {q}, {latency:4} ms, {wall} s: utility {u:.3f}, score {final_score([u]):.1f}")
```

```{.text .output}
reward 0.92, 1150 ms, 52 s: utility 0.120, score 10.7
reward 0.92,   60 ms, 12 s: utility 1.000, score 50.0
reward 0.8,   40 ms, 10 s: utility 0.000, score 0.0
```

The anchor values are ours; the real ones are measured privately. The shape is what matters: being
as good as the anchor scores zero however fast the sampler is, and a slow sampler scores little
however good it is. Both speed ratios must improve for the score to rise.

## What the agents did

| Run | Wall time, whole workload (s) | Success rate | Mean best reward | Prediction time (ms) | Final score |
|---|---|---|---|---|---|
| Human reference | 51.9 | 0.25 | 0.924 | 1,150 | 14.0 |
| GLM 5.3 | 10.8 | 0.25 | 0.94 | 42.5 | 59.8 (fail) |
| Claude Opus 5.5 | 11.8 | 0.167 | 0.921 | 60.4 | 57.1 (fail) |
| Muse Wonder 1.0 | 12.9 | 0.333 | 0.935 | 87.2 | 55.4 (fail) |
| Kimi K3.1 Pro | 13.4 | 0.333 | 0.966 | 120 | 55.2 (fail) |
| Step 5 Preview | 14.2 | 0.417 | 0.966 | 132 | 54.1 (fail) |

No model passed, and all sixteen scored above the human reference (14.0). Every run was much faster
than the 100-step loop; what failed the pass rule was success or reward in some group of episodes.
Step 5 Preview had the highest success rate of these, 0.417, and still failed. GLM 5.3 had the best
final score, 59.8.

**Claude Opus 5.5** (57.1) called the network five times, at levels 95, 70, 45, 22 and 5, starting
from Gaussian noise at the first. At each level it made a clean guess, clipped to the range the
scheduler allows, and wrote the observed entries back in before each call. Between levels it took
second-order DPM-Solver++ jumps along the deterministic path, measured in log signal-to-noise ratio,
and corrected each landing point with the UniPC corrector, which reuses the guess just made, so the
correction costs no extra call. Its last guess became the plan. At 60.4 ms against 1,150 ms, that is
about 12 ms per network call for both samplers (our division).

::: pitfall
**Fast is not enough.** The pass rule asks for reward and success at least as high in every group,
and success is a coin with few tosses per group. A five-call sampler that is 19 times faster can
still lose one group by one episode.
:::

# MuJoCo Playground: a walker that follows a joystick

*MuJoCo Playground* (Zakka et al., RSS 2025) trains robot controllers in a GPU physics simulator
within minutes, running thousands of simulated robots at once. One of its examples teaches a
Unitree Go1 quadruped to follow joystick commands. The policy reads the robot's own sensors and the
commanded forward, sideways and turning speeds, and outputs target angles for its twelve joints. It
is trained by reinforcement learning (PPO) for 200 million simulation steps.

## The reward

The Go1 environment pays, at every control step (50 per second), for tracking the command and
charges for effort. Tracking uses a bell curve, `exp(−error² / 0.25)`, worth 1.0 for linear speed and
0.5 for turning; the action-rate penalty (−0.01 × squared change of the action) keeps motion smooth,
and the energy penalty (−0.001 × |joint speed × torque|) keeps it cheap. There are more terms, for
posture, feet and falls. The step reward is multiplied by the time step and clipped at zero.

Our walker is a body on a plane with two legs. The average leg push sets its forward speed, the
difference sets its turning speed, and the right leg is 20% weaker, which the policy must discover.
Speeds follow the push with a lag of a quarter second, and the speed the robot senses is noisy. A
command is resampled every 5 seconds; an episode is 1,000 steps (20 s). The policy is linear: each
leg's push is a weighted sum of the two commands and the two tracking errors, eight weights in all.

```python
DT, STEPS, LAG, WIDTH = 0.02, 1000, 0.25, 0.5
STRENGTH = (1.0, 0.8)   # the right leg is weaker


def episode(theta, seed, pushes=False):
    """Run one 20 s episode; return the five metrics the task measures."""
    rng = Rng(seed)
    v = w = last_left = last_right = 0.0
    m = {"reward": 0.0, "lin": 0.0, "ang": 0.0, "energy": 0.0, "rate": 0.0}
    for step in range(STEPS):
        if step % 250 == 0:
            cv, cw = 2 * rng.uniform() - 1, 2 * rng.uniform() - 1   # new command
        if pushes and step % 100 == 50:
            v, w = v + 0.5 * rng.gauss(), w + 0.5 * rng.gauss()   # a shove
        f = (cv, cw, cv - v - 0.1 * rng.gauss(), cw - w - 0.1 * rng.gauss())
        left = theta[0] * f[0] + theta[1] * f[1] + theta[2] * f[2] + theta[3] * f[3]
        right = theta[4] * f[0] + theta[5] * f[1] + theta[6] * f[2] + theta[7] * f[3]
        fl, fr = STRENGTH[0] * left, STRENGTH[1] * right
        v += DT * ((fl + fr) / 2 - v) / LAG
        w += DT * ((fr - fl) / WIDTH - w) / LAG
        lin, ang = exp(-((cv - v) ** 2) / 0.25), exp(-((cw - w) ** 2) / 0.25)
        rate = -((left - last_left) ** 2 + (right - last_right) ** 2)
        energy = -(abs(left * fl) + abs(right * fr))
        m["reward"] += max(0.0, lin + 0.5 * ang + 0.01 * rate + 0.001 * energy) * DT
        m["lin"], m["ang"] = m["lin"] + lin, m["ang"] + ang
        m["energy"], m["rate"] = m["energy"] + energy / STEPS, m["rate"] + rate / STEPS
        last_left, last_right = left, right
    return m


stand = [0.0] * 8
guess = [1.0, -0.25, 0.0, 0.0, 1.0, 0.25, 0.0, 0.0]   # feed the command forward, ignore the weak leg
for name, theta in [("stand still", stand), ("hand-made", guess)]:
    m = episode(theta, 3)
    print(f"{name:11}: reward {m['reward']:.2f}, speed tracking {m['lin']:.0f}, turn tracking {m['ang']:.0f}")
```

```{.text .output}
stand still: reward 14.19, speed tracking 466, turn tracking 486
hand-made  : reward 26.33, speed tracking 954, turn tracking 727
```

A perfect walker would earn 1.5 × 0.02 × 1,000 = 30 in our toy. Standing still earns 14.19, since
commands near zero are partly met by doing nothing. The hand-made policy ignores the weak leg and
the errors, and turns poorly.

## Learning by trial

PPO is too large for one screen. **Random search** shows the same loop in small: try the policy with
small random changes to its weights, in both directions, on the same episode; move the weights
toward the changes that earned more. Each iteration costs eight episodes.

```python
def train(iters, seed, step=0.02, nu=0.05, dirs=4):
    rng = Rng(seed)
    theta = [0.0] * 8
    curve = []
    for _ in range(iters):
        grad = [0.0] * 8
        for _ in range(dirs):
            d = [rng.gauss() for _ in range(8)]
            env = rng.next()
            up = episode([t + nu * x for t, x in zip(theta, d)], env)["reward"]
            down = episode([t - nu * x for t, x in zip(theta, d)], env)["reward"]
            grad = [g + (up - down) * x for g, x in zip(grad, d)]
        theta = [t + step * g / (2 * dirs * nu) for t, g in zip(theta, grad)]
        curve.append(episode(theta, 999)["reward"])
    return theta, curve


theta, curve = train(32, seed=1)
print("reward every 4 iterations:", [round(r, 2) for r in curve[3::4]])
print("weights:", [round(t, 2) for t in theta])
```

```{.text .output}
reward every 4 iterations: [18.99, 24.25, 27.18, 28.25, 29.27, 29.35, 29.38, 29.39]
weights: [0.98, -0.25, 1.12, -0.81, 1.25, 0.33, 0.58, 0.93]
```

The learned weights feed the speed command to the right leg with weight 1.25 and to the left with
0.98, close to the 1.25 : 1 that makes up for the weaker leg, and use the tracking errors as feedback. The curve rises fast, then
flattens near the ceiling: late gains are small.

# MuJoCo Playground: same clock, better recipe

## What the agent writes

Here nothing is removed. The authors' training recipe is the bar: Brax PPO on the flat-ground
environment with the repository's settings, 200 million environment steps, which takes about 445 to
465 seconds on one H100. The agent writes its own training procedure, `train(seed, deadline_seconds)`,
which must return a policy within **720 seconds**, counted from the call and including environment
building and compilation. It may change the training rewards, the command distribution, pushes and
terrain, the network, the PPO settings, or the learning algorithm. The policy must be learned inside
the run: shipping trained weights is forbidden, and a size check on the patch backs this up. The
robot model, the observation and action interface and the whole evaluation stay fixed. The agent
has three development submissions, each 20 to 40 minutes.

## How it is judged

A workload is one training seed and one test condition: flat ground, flat ground with pushes, or
rough terrain. The final suite trains five seeds on each side, the agent's procedure and the
reference, and tests each policy in all three conditions: 15 workloads. Each test runs 2,048 robots
for 1,000 steps (20 seconds) with the environment's own rewards. Five metrics are measured: episode
reward, linear-speed tracking, turn tracking, energy and action rate.

The score uses only the mean episode reward `r`:

```python
def playground_score(r):
    r = max(0.0, r)
    return 100 * r / (r + 30)


for r in (0, 15, 30, 30.7, 60, 120):
    print(f"mean episode reward {r:5}: score {playground_score(r):.1f}")
```

```{.text .output}
mean episode reward     0: score 0.0
mean episode reward    15: score 33.3
mean episode reward    30: score 50.0
mean episode reward  30.7: score 50.6
mean episode reward    60: score 66.7
mean episode reward   120: score 80.0
```

The reference earns close to 30, so it scores close to 50; one more unit of reward is worth less than
a point. To **pass**, a policy must be strictly better than the reference trained in the same run on
all five metrics in all 15 workloads, with no tolerance. The statement warns that no such submission
is known: the reference, run against itself, did not meet the rule.

## Using the whole clock

The reference stops after 200 million steps, with four minutes left. A procedure can instead train
in short compiled chunks and stop when the next chunk would no longer finish before the deadline,
with a margin. Our timings below are assumptions, not measurements: one minute of setup and
compilation, then 10 million steps every 19.75 seconds, the pace at which the reference's 200 million
steps end near 455 seconds.

```python
def steps_by_deadline(deadline=720.0, setup=60.0, margin=30.0):
    """Train in chunks of 10 million steps (19.75 s each) while one more fits before the margin."""
    clock, steps = setup, 0
    while clock + 19.75 <= deadline - margin:
        clock += 19.75
        steps += 10_000_000
    return steps, clock


steps, clock = steps_by_deadline()
print(f"{steps / 1e6:.0f} million steps, done at {clock:.2f} s of 720")
```

```{.text .output}
310 million steps, done at 672.25 s of 720
```

In our walker, the same idea is more iterations of random search in the same clock. We compare a
20-iteration recipe (the "reference") with a 32-iteration one, both trained from seeds 1, 2 and 3,
each tested on flat ground and with pushes.

```python
def compare(ours, ref):
    wins = {k: 0 for k in ours[0]}
    for a, b in zip(ours, ref):
        for k in wins:
            wins[k] += a[k] > b[k]
    return wins


ref, ours = [], []
for seed in (1, 2, 3):
    short, _ = train(20, seed)
    long, _ = train(32, seed)
    for pushes in (False, True):
        ref.append(episode(short, 200 + seed, pushes))
        ours.append(episode(long, 200 + seed, pushes))
print("workloads won, of 6:", compare(ours, ref))
print("passes:", all(n == len(ours) for n in compare(ours, ref).values()))
```

```{.text .output}
workloads won, of 6: {'reward': 6, 'lin': 6, 'ang': 6, 'energy': 0, 'rate': 1}
passes: False
```

The longer-trained walker earns more reward and tracks better in every workload, so its score rises.
But it tracks better by pushing harder: it uses more energy in all six workloads, and its actions
change faster in five of the six. Under a "beat it on every metric" rule, a better policy is not enough; it has
to be better at no cost.

## What the agents did

| Run | Action-rate penalty (×10⁻³) | Energy penalty | Episode reward | Turn tracking | Speed tracking | Final score |
|---|---|---|---|---|---|---|
| Human reference | 4.96 | 0.0913 | 29.6 | 467 | 899 | 49.6 |
| GPT-6 Astra | 4.96 | 0.0837 | 30.7 | 474 | 907 | 50.6 (fail) |
| Claude Opus 5.5 | 5.06 | 0.0885 | 30.1 | 471 | 906 | 50.1 (fail) |
| Muse Wonder 1.0 | 5.21 | 0.0903 | 30.1 | 471 | 907 | 50.1 (fail) |
| GPT-6.1 Sol | 3.79 | 0.0822 | 29.9 | 471 | 918 | 49.9 (fail) |
| Qwen 3.8 Max | 4.6 | 0.0889 | 27.5 | 466 | 821 | 47.9 (fail) |

The penalties are shown as positive numbers, so lower is better for them. No model passed; ten
scored above the human reference (49.6) and three level with it. GPT-6 Astra had the best final
score, 50.6. Two runs (Gemini 4 Argon · Pi and DeepSeek V4.1 Flash 1017) scored 0.0. The spread is
narrow: the reference recipe is already good.

**Claude Opus 5.5** (50.1) kept Brax's PPO loss, networks and observation normalizer but wrote its
own training loop, collecting rollouts from 8,192 simulated robots. It trained on the authors'
flat-ground environment, reward and randomization, with pushes left off. Over the last 60% of the
budget, it lowered the learning rate and the entropy bonus linearly to a tenth of their starting
values, so the final policy settles instead of being a snapshot of noisy updates. Its own idea was
to use the deadline: it trained in short compiled chunks, timed each one, stopped when the next would
not finish a safety margin before the deadline, and skipped evaluation rollouts. In its own
estimate, that gave about 360 million environment steps instead of 200 million. It earned more
reward and tracked better, but its action-rate penalty (5.06 × 10⁻³) was higher than the
reference's (4.96 × 10⁻³): as in our walker, better tracking came with a penalty that got worse.

::: pitfall
**Noise decides close races.** Across training seeds, the reference's flat-ground reward varies by
about 0.2 to 0.3, and the same seed does not reproduce exactly on a GPU. With three development
submissions, each one a single noisy sample, an agent cannot tell a gain of 0.5 from luck.
:::

# Summary and self-check

::: pattern
**Three lessons from the Robotics tasks.**

1. *Average the right thing.* Regression averages two good actions into a bad one; a denoising
   sampler keeps both, because each step commits a little more.
2. *Calls are the cost.* A sampler's time is its number of network calls. Five well-placed calls with
   a second-order step do the work of a hundred.
3. *Every metric, every workload.* In both tasks, every run improved the score, and none passed:
   one group of episodes, or one penalty, was enough to fail.
:::

## Exercises

1. Change the demonstrations to 70% left and 30% right. What is the regression answer now, and how
   does the 100-call sampler split?
2. Run `ddim` with one call at level 50 instead of 100 (`levels = [50]`). What do the samples look
   like, and why?
3. Find three levels for `dpm2` that leave fewer than 30 of 1,000 samples in the middle.
4. Make the walker's right leg weaker still (`STRENGTH = (1.0, 0.6)`). How does the hand-made policy
   do, and which weights does random search change?
5. In `compare`, add a 1% tolerance for energy. Does the 32-iteration walker pass now?
