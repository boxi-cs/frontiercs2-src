---
title: "Lecture 11: Cryptography"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has three Cryptography tasks: **Structured LWE**, which asks for the secrets of 200
learning-with-errors instances (CRYPTO 2024); **CKKS Noise**, an estimator that predicts how much
precision survives an encrypted computation (IACR CiC 2025); and **QuarterPIR**, a way to read a
database entry without the server learning which one (EUROCRYPT 2024). For each, these notes explain
the paper's idea, the part the task removed, how a run is judged, and what the agents did.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task pages and results: <https://frontier-cs.org/> (as of October 26, 2026). The
QuarterPIR figures follow the case study *Two Checksums Shrink Private Lookups by 27%* (October 17,
2026). The task statements are the public ones an agent reads. Nothing here comes from the hidden
workloads or the human reference patches.

**Numbers.** Pass counts and scores are from the 16-model leaderboard. The QuarterPIR case study
counted twelve models and seven passes; the task page now shows 11 of 16. The toy sizes (a 12-entry
secret, a 2^20 scale, 16 database entries) are ours.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. State the learning-with-errors problem and check a candidate secret against its public rules.
2. Explain why a sparse secret makes LWE easier, and estimate a brute-force search.
3. Measure the precision of an approximate computation in bits, and explain how a noise estimator predicts it.
4. Read a private lookup from a hint by hand, and explain why the server cannot tell which entry it was.
5. Recover two unknown differences from a plain sum and a weighted sum.
6. Explain how the QuarterPIR task makes privacy checkable without a proof.

# Structured LWE: find the secret

**Learning with errors** (LWE) is the hard problem beneath much post-quantum cryptography. Given a
public matrix `A` and a vector `b = A s + e (mod q)`, find the secret `s`. Both `s` and the error `e`
are small. Without the error, Gaussian elimination would find `s` at once; the error is what makes
it hard. Extra **structure**, such as a sparse matrix or a secret with few nonzero entries, can open
shortcuts. *A Systematic Study of Sparse LWE* (CRYPTO 2024) studies these structured variants.

## A small instance

Our instance has `n = 12` unknowns, `m = 20` equations and modulus `q = 97`. The secret is ternary
(entries −1, 0 or 1) with exactly two nonzero entries, and each error is −1, 0 or 1. A small
generator, exact in JavaScript too, makes everything reproducible.

```python
class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def next(self):
        self.state = self.state * 48271 % 2147483647
        return self.state

    def below(self, k):
        return self.next() % k

    def uniform(self):
        return self.next() / 2147483647


Q, N, M, WEIGHT = 97, 12, 20, 2


def center(v, q=Q):
    """The representative of v mod q in [-q//2, q//2]."""
    v %= q
    return v - q if v > q // 2 else v


def make_instance(seed):
    rng = Rng(seed)
    A = [[rng.below(Q) for _ in range(N)] for _ in range(M)]
    support = []
    while len(support) < WEIGHT:
        j = rng.below(N)
        if j not in support:
            support.append(j)
    s = [0] * N
    for j in sorted(support):
        s[j] = 1 if rng.below(2) else -1
    e = [rng.below(3) - 1 for _ in range(M)]
    b = [(sum(a * x for a, x in zip(row, s)) + ei) % Q for row, ei in zip(A, e)]
    return A, b, s


A, b, planted = make_instance(2024)
print("b =", b)
```

```{.text .output}
b = [66, 93, 44, 33, 14, 23, 21, 32, 29, 4, 61, 51, 80, 10, 17, 25, 54, 71, 39, 80]
```

The task checks a candidate exactly the way its public rules say: the right length, entries from
the allowed alphabet, the right number of nonzeros, and a small residual `b − A s` in every row,
after centering mod `q`. Any secret that passes counts, not only the one that was planted.

```python
def valid(A, b, s):
    if len(s) != N or any(x not in (-1, 0, 1) for x in s):
        return False
    if sum(x != 0 for x in s) != WEIGHT:
        return False
    residual = [center(bi - sum(a * x for a, x in zip(row, s))) for row, bi in zip(A, b)]
    return max(abs(r) for r in residual) <= 1


print(valid(A, b, [0] * N), valid(A, b, planted))
```

```{.text .output}
False True
```

## The shortcut of a sparse secret

With two nonzero entries, there are only `C(12, 2) × 2² = 264` candidates. We can try them all.

```python
from itertools import combinations, product

tried, found = 0, []
for positions in combinations(range(N), WEIGHT):
    for signs in product((1, -1), repeat=WEIGHT):
        s = [0] * N
        for j, sign in zip(positions, signs):
            s[j] = sign
        tried += 1
        if valid(A, b, s):
            found.append(s)
print(tried, "candidates tried; valid:", found)
```

```{.text .output}
264 candidates tried; valid: [[0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0]]
```

A dense ternary secret of the same length would have 3¹² = 531,441 candidates. At realistic sizes
neither search is possible, but sparsity still shrinks the space enormously:

```python
from math import comb, log2

for n, w in [(12, 2), (256, 14), (256, 64)]:
    sparse = log2(comb(n, w) * 2 ** w)
    print(f"n={n:3} weight {w:2}: 2^{sparse:.0f} sparse candidates, 2^{n * log2(3):.0f} dense")
```

```{.text .output}
n= 12 weight  2: 2^8 sparse candidates, 2^19 dense
n=256 weight 14: 2^89 sparse candidates, 2^406 dense
n=256 weight 64: 2^268 sparse candidates, 2^406 dense
```

Real attacks combine **lattice reduction**, which turns `b = A s + e` into a short-vector problem,
with combinatorial guessing of the sparse part. The sizes `n = 256` and the weights here are our
examples.

## What the agent writes, and how it is judged

Here there is no solver to restore. The agent writes its own attacks and submits one secret per
instance. There are 200 public instances in ten families of matrix and secret structure: dense or
sparse matrices, with binary, ternary, small or unrestricted mod-`q` secrets. Each submitted secret
is checked directly against the published rules. The score is the share of instances solved; a pass
means solving all 200.

No model passed. GPT-6 Astra and GPT-6.1 Terra solved 84%; Claude Opus 5.5 solved 72% (144 of 200),
all 20 in six families and the first six in each of the other four. With an FDI of 97.4, Structured
LWE is the second-hardest task of the benchmark.

::: pitfall
**Some families are hard by design.** LWE with a uniform secret and no extra structure is believed
to be hard even for quantum computers. A family that is solvable at its size still needs the right
attack, and an agent has five hours.
:::

# CKKS Noise: predicting precision

**Homomorphic encryption** lets a server compute on encrypted data. **CKKS** computes on encrypted
vectors of real or complex numbers, thousands of *slots* at once, and its results are approximate:
every operation adds a little noise. How many correct bits survive a long computation? The paper
*Accurate and Composable Noise Estimates for CKKS* (IACR CiC 2025) answers with an **estimator** that
replays the computation on clear values, adding modeled noise at each step, instead of running it
encrypted.

## Precision in bits

A slot's **precision** is `−log2 |error|`: an error of 2⁻¹⁶ means 16 correct bits after the point.
The task asks for the mean and the spread (standard deviation) of the precision over all slots.

Our toy works like a fixed-point CKKS. A value `x` is stored as `x × Δ` plus a little Gaussian noise
(standard deviation 3.2, a usual choice); squaring multiplies two noisy values, divides by `Δ`
(**rescaling**) and adds rounding and key-switching noise.

```python
from math import cos, log, pi, sqrt
from statistics import mean, pstdev

DELTA, SLOTS, SIGMA = 2 ** 20, 2048, 3.2


def gauss(rng):
    """A standard normal sample (Box-Muller)."""
    u1, u2 = rng.uniform(), rng.uniform()
    return sqrt(-2 * log(u1)) * cos(2 * pi * u2)


def run(values, squarings, rng):
    """Encode, then square `squarings` times, adding noise as CKKS would. Returns decoded slots."""
    c = [x * DELTA + SIGMA * gauss(rng) for x in values]
    for _ in range(squarings):
        c = [ci * ci / DELTA + (rng.uniform() - 0.5) + gauss(rng) for ci in c]
    return [ci / DELTA for ci in c]


def precision(decoded, truth):
    bits = [-log2(abs(d - t)) for d, t in zip(decoded, truth)]
    return round(mean(bits), 3), round(pstdev(bits), 3)


inputs = Rng(7)
xs = [0.9 + 0.2 * inputs.uniform() for _ in range(SLOTS)]
for k in range(6):
    truth = [x ** (2 ** k) for x in xs]
    actual = precision(run(xs, k, Rng(1)), truth)
    predicted = precision(run(xs, k, Rng(2)), truth)
    print(f"{k} squarings: actual {actual}, estimator {predicted}")
```

```{.text .output}
0 squarings: actual (19.257, 1.581), estimator (19.215, 1.621)
1 squarings: actual (18.242, 1.626), estimator (18.226, 1.619)
2 squarings: actual (17.257, 1.637), estimator (17.226, 1.632)
3 squarings: actual (16.275, 1.675), estimator (16.252, 1.711)
4 squarings: actual (15.345, 2.045), estimator (15.307, 2.005)
5 squarings: actual (14.448, 3.006), estimator (14.425, 3.004)
```

Each squaring costs about one bit: squaring doubles the relative error. In the toy, "actual" and
"estimator" run the same model with different noise samples; in the task, "actual" is a real
encrypted Lattigo run, and the estimator must get within a few hundredths of a bit of it.

## What the agent writes, and how it is judged

The task removes seven of the estimator's kernels: the noise of multiplication, summed products,
relinearization, rescaling, division with rounding, and two key-switching methods. The agent writes
them and may redesign how the estimator represents a noisy value.

Each submission predicts nine encrypted computations, from one product to bootstrapping, under 29
settings. Real encrypted runs give the true mean and spread of precision. To pass, on every setting
it must predict both as well as the human reference, within a band for run-to-run variation, and
its estimator must run **faster**. The score depends only on accuracy:

```python
def ckks_score(discrepancies):
    """discrepancies: (mean error, spread error) in bits for each configuration."""
    E = sum(a + s for a, s in discrepancies) / (2 * len(discrepancies))
    return 100 / (1 + E)


print(f"{ckks_score([(0.0389, 0.0435)]):.1f}")
```

```{.text .output}
96.0
```

With the reference's mean errors on the leaderboard (0.0389 and 0.0435 bits), the formula gives its
score of 96.0. Small errors leave little room: the best run scored 97.1.

## What the agents did

Eleven of sixteen models passed. **Claude Opus 5.5** scored 97.1 with errors of 0.0285 and 0.0322
bits, and ran in 102 ms against the reference's 486. It kept each noisy value in ordinary double
precision instead of arbitrary precision, split the noise into terms attached to 1, `s` and `s²`
as in a real ciphertext, and skipped key-switching digits too small to matter. Its own idea was to
carry **16 noise replicas**, each with its own sampled secret key, and keep the one whose statistics
lie closest to the average of all 16, so that one unlucky sample does not skew the prediction.

```python
k = 3
truth = [x ** (2 ** k) for x in xs]
actual = precision(run(xs, k, Rng(1)), truth)
replicas = [precision(run(xs, k, Rng(100 + r)), truth) for r in range(16)]
avg = (mean(r[0] for r in replicas), mean(r[1] for r in replicas))
pick = min(replicas, key=lambda r: (r[0] - avg[0]) ** 2 + (r[1] - avg[1]) ** 2)


def miss(r):
    return round(abs(r[0] - actual[0]) + abs(r[1] - actual[1]), 3)


print("worst replica", max(miss(r) for r in replicas), " picked", miss(pick))
```

```{.text .output}
worst replica 0.25  picked 0.06
```

A single replica can miss by a quarter of a bit; the one nearest the average misses by 0.06.

# QuarterPIR: reading privately

**Private information retrieval** (PIR) lets a client read one database entry without the server
learning which. **QuarterPIR** (Ghoshal, Zhou and Shi, EUROCRYPT 2024) needs no public-key
cryptography. The client streams the database once and keeps **hints**; each later lookup then needs
one short request and reply.

## A hint

Picture the database as rows of entries: 16 entries A to P in four rows of four. A hint is one entry
per row, such as B, G, I and O, and the client stores only the XOR of their values, the hint's
**parity**. To read G, the client asks for the parity of B, F, I and O, with G swapped for a spare
entry F whose value it stored. XORing the reply with the parity leaves `G ⊕ F`, and one more XOR
gives G. The server sees one position per row and cannot tell which one was swapped.

```python
rng = Rng(11)
DB = {name: rng.below(256) for name in "ABCDEFGHIJKLMNOP"}
ROWS = ["ABCD", "EFGH", "IJKL", "MNOP"]


def parity(names):
    p = 0
    for name in names:
        p ^= DB[name]
    return p


hint = ["B", "G", "I", "O"]
stored = parity(hint)               # kept by the client after its one pass
spare, spare_value = "F", DB["F"]   # a spare entry of G's row, also kept


def lookup(want):
    request = [spare if name == want else name for name in hint]
    reply = parity(request)          # all the server does
    return request, reply ^ stored ^ spare_value


request, value = lookup("G")
print("request", request, " value", value, " correct", value == DB["G"])
```

```{.text .output}
request ['B', 'F', 'I', 'O']  value 128  correct True
```

The client keeps many hints, enough that every entry lies in some hint, and each hint serves one
lookup. After a lookup it replaces the used hint with a **backup hint** for the same row.

## Keys, groups and the bytes

A real database has thousands of rows, so a request cannot name an entry in each. QuarterPIR puts
the rows in groups (128 rows to a group at full size). A 16-byte **key** expands into one position
per row of a group. A request sends one key per group, except the wanted entry's group, which goes
as an explicit **list** of positions with random bytes in place of its key. The server XORs what each
key picks, the **group parity** `K_b` of group `b`; it tries the list in every group, giving one
**candidate** per group; and it returns all candidates and all group parities. The client keeps the
candidate of its own group. It needs the group parities to correct the error that a refreshed hint
leaves, and it cannot ask for just the one it needs without revealing its last read. So every reply
carries every group parity.

```python
def reference_bytes(chunk_size, groups, rows_per_group):
    keys = 16 * groups
    offset_list = rows_per_group * (chunk_size.bit_length() - 1) // 8  # log2(chunk) bits each
    candidates = parities = 16 * groups
    return keys + offset_list, candidates + parities


for entries, chunk, groups, rows in [(65_536, 512, 4, 32), (67_108_864, 16_384, 32, 128)]:
    request, reply = reference_bytes(chunk, groups, rows)
    print(f"{entries:>10,} entries: request {request}, reply {reply}, total {request + reply}")
```

```{.text .output}
    65,536 entries: request 100, reply 128, total 228
67,108,864 entries: request 736, reply 1024, total 1760
```

These are the reference's counts in the task statement. At full size, half the reply (512 bytes) is
group parities.

## The two checksums

The task's goal is strictly fewer bytes per lookup, while also being faster and using no more client
memory. **Muse Wonder 1.0** found the biggest cut, with a trick from RAID-6 disk arrays: two
checksums can rebuild two lost values. The server's group parities and the client's own parities
agree in every group but two, and the client knows which two. So the server sends only a plain sum
and a weighted sum of its group parities, and the client compares them with the same sums of its
own. Two equations give the two differences. The real scheme adds with XOR and weights in the finite
field with 2¹²⁸ elements; here is the same step with ordinary numbers, as in the case study.

```python
def two_sums(values):
    return sum(values), sum((i + 1) * v for i, v in enumerate(values))


server = [4, 7, 1, 9]   # the server's group parities (it sends only their two sums)
client = [4, 2, 1, 6]   # the client's own; they differ only in groups 2 and 4
(s1, w1), (s2, w2) = two_sums(server), two_sums(client)
g, h = 2, 4             # the two groups the client knows can differ
plain, weighted = s1 - s2, w1 - w2
d_h = (weighted - g * plain) // (h - g)
d_g = plain - d_h
print(f"sums {s1}, {s2}; weighted {w1}, {w2}; differences: group {g} {d_g}, group {h} {d_h}")
```

```{.text .output}
sums 21, 13; weighted 57, 35; differences: group 2 5, group 4 3
```

Two 16-byte checksums replace 32 group parities, so at full size the reply falls from 1,024 bytes to
544 and the lookup from 1,760 bytes to 1,280: 27% fewer. The client stores one extra value per
backup hint.

## Privacy without a proof

A new message format would normally need a new security proof. The task makes privacy checkable
instead. For every lookup, the trusted harness computes the request the authors' client would send,
`R`, and passes it alone to the agent's `ReduceRequest` in a separate process, with no index, no
client state and no randomness. The server receives only `f(R)`. Since its view is a public function
of the authors' server's view, it learns nothing more. The reply is free: the server computes it from
the database and the request, so it carries no privacy content.

## Results

Eleven of sixteen models passed; fifteen scored above the human reference (27.3). Gemini 4 Argon ·
Antigravity had the best final score, 62.8, mostly from speed. Muse Wonder 1.0 (58.1) cut the most
bytes, and was also much faster: at 67 million entries, server time per lookup fell from 856 µs to
100 µs and client setup from 122.2 s to 18.7 s. Claude Opus 5.5 (55.3) instead dropped some keys
from the request and stored the parities those keys would give, as client memory allowed.

::: pitfall
**Every metric counts, memory too.** Kimi K3 sent only 736 bytes per lookup at 67 million entries,
the fewest of any run, but kept 606.8 MB on the client against the reference's 85.3 MB, so it
failed.
:::

# Summary and self-check

::: pattern
**Three lessons from the Cryptography tasks.**

1. *The bar can be absolute.* Structured LWE asks for all 200 secrets; 84% was the best anyone did.
2. *An estimator must be right and fast.* CKKS Noise passes only if the predictions are as good as
   the reference's on every setting and the estimator runs faster.
3. *Redesign the message, not just the code.* In QuarterPIR, the largest byte cut came from an old
   idea in a new place: two checksums from RAID-6.
:::

## Exercises

1. In the LWE instance, allow secrets with weight 1 to 3 instead of exactly 2. How many candidates
   are there now, and does the search still find only the planted secret?
2. Run the CKKS toy with `SIGMA = 6.4`. By how much does the precision fall, and why?
3. In the PIR toy, read entry O with the same hint. Which spare entry do you need?
4. Change `server` so that groups 1 and 3 differ from `client`, and solve for the two differences
   with `g, h = 1, 3`.
5. The weighted checksum uses weights 1, 2, 3, 4. Why would weights 1, 1, 1, 1 not work?
