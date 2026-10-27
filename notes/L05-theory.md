---
title: "Lecture 05: Theory"
subtitle: "FrontierCS 2 — Lecture Notes"
---

FrontierCS 2 has one Theory task: **Binary Fuse Filter**, from Graf and Lemire's paper *Binary Fuse
Filters: Fast and Smaller Than Xor Filters* (ACM JEA 2022). A binary fuse filter answers "is this key
in the set?" for a fixed set of keys. It never misses a stored key, it rarely accepts an absent one,
and it uses only 13% more memory than any such filter must. The task removes the step that builds
it. With one task, this lecture goes deeper than the others: from a Bloom filter, to an xor filter
built by peeling a hypergraph, to the binary fuse layout, and then to the task and what the agents
wrote.

The Python programs are ours. They are small models of each idea, and they run offline with the
standard library. Every program in these notes has been run, and every output shown is the real
output.

::: instructor
**Sources.** Task page and results: <https://frontier-cs.org/> (as of October 26, 2026). The task
statement and the library's public header are the ones an agent reads. The paper is
[arXiv 2201.01174](https://arxiv.org/abs/2201.01174). Nothing here comes from the hidden workloads or
the human reference patch. There is no case study for this task yet.

**Numbers.** Pass counts, metrics and scores are from the 16-model leaderboard. The "human reference
in this run" values come from the hover text of the task page's results table. The toy sizes
(1,000 keys for the Bloom filter, 8 keys in 12 slots, 2,000 and 200,000 keys for peeling) are ours;
the layout formulas are copied from the library's public header.
:::

# Learning objectives {.unnumbered}

After this lecture you will be able to:

1. Explain approximate membership: no false negatives, a small false-positive rate, and the
   lower bound of `log2(1/ε)` bits per key.
2. Build a Bloom filter and predict its false-positive rate.
3. Build an xor filter by peeling a 3-hypergraph, and explain why it needs about 1.23 slots per key.
4. Explain how the binary fuse layout (three nearby segments) lets peeling succeed with fewer slots.
5. Compute the reference's memory and space overhead from its layout, and a run's score from its
   measurements.
6. Explain why a pass requires winning every metric on every workload, and how runs failed.

# Approximate membership and the Bloom filter

A **filter** answers one question about a set `S` of keys: is `x` in `S`? It may say "yes" for a key
that is not in `S` (a **false positive**), with a small probability `ε`, but it never says "no" for a
key that is in `S`. Engineers put a filter in front of something slow, a disk or a network, so most
lookups of absent keys stop early. A filter stores much less than the keys themselves. Any filter
with false-positive rate `ε` needs at least `log2(1/ε)` bits per key; for `ε = 1/256`, that is 8 bits.

## Keys and a hash

Our keys are 31-bit integers from a small generator, exact in JavaScript too. `hash32` scrambles a
key with a seed into 32 random-looking bits (it ends with MurmurHash3's finalizer). Different seeds
give independent-looking hashes.

```python
class Rng:
    """Park-Miller generator: small, and exact in JavaScript too."""

    def __init__(self, seed):
        self.state = seed

    def next(self):
        self.state = self.state * 48271 % 2147483647
        return self.state


MASK = 0xFFFFFFFF


def hash32(key, seed):
    """32 scrambled bits of (key, seed)."""
    x = (key * 0x9E3779B1 + seed) & MASK
    x ^= x >> 16
    x = x * 0x85EBCA6B & MASK
    x ^= x >> 13
    x = x * 0xC2B2AE35 & MASK
    x ^= x >> 16
    return x


def make_keys(n, seed, avoid=()):
    """n distinct keys, none of them in `avoid`."""
    rng, keys = Rng(seed), set()
    while len(keys) < n:
        key = rng.next()
        if key not in avoid:
            keys.add(key)
    return sorted(keys)


keys = make_keys(1000, 1)
absent = make_keys(100_000, 2, avoid=set(keys))
print(keys[:3], hash32(keys[0], 0), hash32(keys[0], 1))
```

```{.text .output}
[48271, 665722, 2345263] 1585686199 2242923684
```

## A Bloom filter

A **Bloom filter** (Bloom, 1970) is an array of `m` bits. To add a key, set the bits at `k` hashed
positions. To look one up, check that all `k` bits are set. A stored key always finds its bits set;
an absent key passes only if other keys happened to set all `k` of its bits.

```python
from math import exp


def bloom_build(keys, m, k):
    bits = [0] * m
    for key in keys:
        for i in range(k):
            bits[hash32(key, i) % m] = 1
    return bits


def bloom_has(bits, key, k):
    return all(bits[hash32(key, i) % len(bits)] for i in range(k))


m, k = 8 * len(keys), 5              # 8 bits per key, 5 hashes
bits = bloom_build(keys, m, k)
misses = sum(not bloom_has(bits, key, k) for key in keys)
false = sum(bloom_has(bits, key, k) for key in absent)
predicted = (1 - exp(-k * len(keys) / m)) ** k
print(f"stored keys missed: {misses}")
print(f"false positives: {false} of {len(absent)} = {false / len(absent):.4f}, predicted {predicted:.4f}")
```

```{.text .output}
stored keys missed: 0
false positives: 2063 of 100000 = 0.0206, predicted 0.0217
```

With 8 bits per key, the Bloom filter's false-positive rate is about 2%, five times the 1/256 that
8 bits allow in principle. The best Bloom filter needs `1.44 log2(1/ε)` bits per key: 44% above the
lower bound. Xor filters cut this to 23%, and binary fuse filters to 13% (paper's abstract):

```python
from math import log2

print("bits per key   eps=2^-8  eps=2^-16")
for name, factor in [("lower bound", 1.0), ("Bloom", 1.44), ("xor", 1.23), ("binary fuse", 1.125)]:
    print(f"{name:13} {factor * 8:9.2f} {factor * 16:10.2f}")
```

```{.text .output}
bits per key   eps=2^-8  eps=2^-16
lower bound        8.00      16.00
Bloom             11.52      23.04
xor                9.84      19.68
binary fuse        9.00      18.00
```

A Bloom filter also reads `k` scattered bits per lookup. The two newer filters read exactly three
slots and XOR them.

# The xor filter: peeling a hypergraph

An **xor filter** (Graf and Lemire, 2020) stores a table `B` of small values, each `b` bits. Every
key has a `b`-bit **fingerprint** `f(x)` and three slots `h0(x)`, `h1(x)`, `h2(x)`, one in each third
of the table. Construction must fill `B` so that, for every stored key,

`B[h0(x)] ⊕ B[h1(x)] ⊕ B[h2(x)] = f(x)`.

A lookup computes the three slots and the fingerprint, and answers "yes" when the equation holds. A
stored key always passes. An absent key passes when three unrelated table values happen to XOR to
its fingerprint, with probability `2^-b`: 1/256 for 8-bit fingerprints.

## Peeling

Each key is an edge joining three slots: the keys form a **3-hypergraph** on the slots. Filling `B`
means solving one XOR equation per key. **Peeling** solves them without any algebra:

1. Count, for every slot, how many keys use it, and keep the XOR of those keys.
2. A slot used by exactly one key belongs to that key alone. Remove the key from its three slots
   (the XOR of the remaining keys tells exactly which key it was) and remember the pair
   (key, slot). Removing it may leave other slots with one key; repeat.
3. If every key was removed, go back through them in **reverse** order. Each key's own slot is still
   free, so set it to whatever makes the key's equation hold. Keys peeled earlier only touch slots
   that are set later, so no equation is broken.

```python
def build(keys, size, where, fingerprint):
    """Fill a table of `size` slots, or return None if peeling gets stuck."""
    count, mask = [0] * size, [0] * size   # keys using each slot, XOR of those keys
    for key in keys:
        for s in where(key):
            count[s] += 1
            mask[s] ^= key
    stack = [s for s in range(size) if count[s] == 1]
    order = []                             # (key, its own slot), in peeling order
    while stack:
        s = stack.pop()
        if count[s] != 1:
            continue
        key = mask[s]                      # the only key left in slot s
        order.append((key, s))
        for t in where(key):
            count[t] -= 1
            mask[t] ^= key
            if count[t] == 1:
                stack.append(t)
    if len(order) < len(keys):
        return None, order
    table = [0] * size
    for key, s in reversed(order):         # slot s is still 0, so this sets it
        a, b, c = where(key)
        table[s] = fingerprint(key) ^ table[a] ^ table[b] ^ table[c]
    return table, order


def xor_where(size, seed):
    third = size // 3
    return lambda key: [i * third + hash32(key, seed + i) % third for i in range(3)]


def fingerprint8(key):
    return hash32(key, 99) & 0xFF
```

Here are 8 keys in 12 slots. The first seed that peels completely is kept; a real filter retries with
a new seed in the same way.

```python
small = [12, 25, 37, 48, 51, 66, 74, 89]
seed = 0
while True:
    where = xor_where(12, seed)
    table, order = build(small, 12, where, fingerprint8)
    if table:
        break
    seed += 1
print("seed", seed)
print("slots:", {key: where(key) for key in small})
print("peeled:", ", ".join(f"{key}@{s}" for key, s in order))
print("table:", " ".join(f"{v:02x}" for v in table))
```

```{.text .output}
seed 3
slots: {12: [2, 5, 9], 25: [0, 7, 8], 37: [3, 6, 8], 48: [0, 7, 9], 51: [3, 4, 9], 66: [0, 5, 11], 74: [1, 6, 10], 89: [3, 4, 10]}
peeled: 66@11, 12@5, 74@1, 89@10, 51@4, 48@9, 25@7, 37@8
table: 00 2c 00 00 4f 05 00 cc 7c 7f cf 5e
```

## Lookups and false positives

```python
def contains(table, where, fingerprint, key):
    a, b, c = where(key)
    return table[a] ^ table[b] ^ table[c] == fingerprint(key)


print("stored keys found:", all(contains(table, where, fingerprint8, key) for key in small))

size = 3 * -(-int(1.23 * len(keys) + 32) // 3)   # 1.23 slots per key, plus 32, rounded up to 3 parts
where = xor_where(size, 0)
table, order = build(keys, size, where, fingerprint8)
false = sum(contains(table, where, fingerprint8, key) for key in absent)
print(f"{len(keys)} keys in {size} slots: {false} false positives of {len(absent)}"
      f" = {false / len(absent):.5f}; 1/256 = {1 / 256:.5f}")
```

```{.text .output}
stored keys found: True
1000 keys in 1263 slots: 403 false positives of 100000 = 0.00403; 1/256 = 0.00391
```

## Why 1.23 slots per key

Peeling needs a slot with one key to start and keeps finding new ones as keys are removed. With too
few slots, it gets stuck: every remaining slot is shared by two or more keys (a **2-core** remains).
For random 3-hypergraphs, there is a sharp threshold near 1.222 slots per key. With 2,000 keys:

```python
from math import ceil

keys2k = make_keys(2000, 3)
for factor in (1.15, 1.18, 1.21, 1.24, 1.27, 1.30):
    size = 3 * ceil(factor * len(keys2k) / 3)
    ok = sum(build(keys2k, size, xor_where(size, 10 * s), fingerprint8)[0] is not None
             for s in range(10))
    print(f"{factor:.2f} slots per key: {ok} of 10 seeds peel")
```

```{.text .output}
1.15 slots per key: 0 of 10 seeds peel
1.18 slots per key: 0 of 10 seeds peel
1.21 slots per key: 1 of 10 seeds peel
1.24 slots per key: 8 of 10 seeds peel
1.27 slots per key: 10 of 10 seeds peel
1.30 slots per key: 10 of 10 seeds peel
```

At 2,000 keys the threshold is still blurred; with millions of keys it becomes a cliff. Below it,
retrying seeds does not help. So an xor filter spends 1.23 × 8 = 9.84 bits per key for `ε = 1/256`.

# The binary fuse filter

The binary fuse filter changes only where a key's three slots go. The table is cut into many equal
**segments** of length `L`, a power of two. A key picks one starting segment at random, and its
three slots lie in that segment and the next two, at random offsets. This layout comes from the
**fuse graphs** of Dietzfelbinger and Walzer (2019).

## The layout

The library's public header chooses the segment length and the number of slots per key from the
number of keys `n`. Here are its formulas, for three slots per key:

```python
from math import floor, log


def fuse_layout(n):
    """Segment length, start segments, table size and slots per key, as in binaryfusefilter.h."""
    seg = 1 << floor(log(n) / log(3.33) + 2.25)
    factor = max(1.125, 0.875 + 0.25 * log(1_000_000) / log(n))
    capacity = round(n * factor)
    while seg > 256 and ceil(capacity / seg) < 32 + 2:
        seg //= 2
    starts = ceil(capacity / seg) - 2
    return seg, starts, (starts + 2) * seg, factor


def fuse_where(seg, starts, seed):
    def where(key):
        first = (hash32(key, seed) * starts >> 32) * seg   # start of the chosen segment
        return [first + i * seg + hash32(key, seed + 1 + i) % seg for i in range(3)]
    return where


for n in (10_000, 100_000, 200_000, 1_000_000):
    seg, starts, size, factor = fuse_layout(n)
    print(f"n={n:>9,}: segments of {seg:4}, {starts + 2:3} segments, {size:>9,} slots, {size / n:.3f} per key")
```

```{.text .output}
n=   10,000: segments of  256,  49 segments,    12,544 slots, 1.254 per key
n=  100,000: segments of 2048,  58 segments,   118,784 slots, 1.188 per key
n=  200,000: segments of 4096,  57 segments,   233,472 slots, 1.167 per key
n=1,000,000: segments of 8192, 138 segments, 1,130,496 slots, 1.130 per key
```

(The real hash places the first slot anywhere in the first `starts` segments, then shifts by whole
segments and scrambles the low bits. Ours picks a segment and three offsets; the shape is the same.)

## Peeling with fewer slots

At 200,000 keys the header asks for 1.167 slots per key. An xor filter of that size cannot peel; the
same keys in the fuse layout can:

```python
n = 200_000
big = make_keys(n, 4)
seg, starts, size, factor = fuse_layout(n)
for s in range(3):
    fuse_where_s = fuse_where(seg, starts, 10 * s)
    fuse_table, _ = build(big, size, fuse_where_s, fingerprint8)
    xor_table, _ = build(big, size, xor_where(size, 10 * s), fingerprint8)
    print(f"seed {10 * s}: {size:,} slots, fuse {'peels' if fuse_table else 'stuck'},"
          f" xor {'peels' if xor_table else 'stuck'}")
    if fuse_table:
        kept = fuse_table, fuse_where_s
```

```{.text .output}
seed 0: 233,472 slots, fuse peels, xor stuck
seed 10: 233,472 slots, fuse peels, xor stuck
seed 20: 233,472 slots, fuse peels, xor stuck
```

## Why it is called a fuse

The first segment can only hold a key's first slot, and the last segment only its third slot, so
the two ends are thinly used. Peeling starts there, and each removed key frees slots one segment
further in, like a fuse burning toward the middle. Here is the average peeling time of each segment,
as a percentage of the whole run, for 2,000 keys:

```python
n = 2000
seg, starts, size, factor = fuse_layout(n)
fuse_table, order = build(keys2k, size, fuse_where(seg, starts, 0), fingerprint8)
when = [0] * size
for step, (key, s) in enumerate(order):
    when[s] = step
print(f"{starts + 2} segments of {seg}; peeled: {fuse_table is not None}")
print([round(100 * sum(when[g * seg:(g + 1) * seg]) / seg / len(order)) for g in range(starts + 2)])
```

```{.text .output}
11 segments of 256; peeled: True
[13, 36, 59, 56, 49, 44, 46, 37, 29, 16, 6]
```

The ends finish first and the middle last. Because a key's three slots are close together, the
table is also friendlier to the cache, which is one reason construction can be more than twice as
fast as for xor filters (paper's abstract).

# The task: construction, judged five ways

## What the agent writes

The task keeps the library's allocation, lookup and serialization, and removes the **population**
routines, the step that fills the table, for 8-bit and 16-bit fingerprints. (The xor filter's
construction is removed too, so it cannot serve as an answer; it is not scored.) The agent writes
`binary_fuse8_populate` and `binary_fuse16_populate`. It may also change the filter's struct, its
hash and its lookup, changing up to 32 files under `include/`, as long as the API stays the same and every byte the
filter keeps is allocated through `malloc` and friends, where the evaluator counts it.

## How it is judged

Filters hold 10,000, 100,000 or 1,000,000 distinct keys from three families of key patterns, with
both fingerprint widths. Each answers four query streams: 0%, 50%, 25% and 100% stored keys. With a
development seed and a private one, that makes 144 workloads. Every stored key must be found, and
false positives must stay under an allowance. For `m` absent queries and `b`-bit fingerprints:

```python
from math import sqrt


def allowance(m, b):
    mean = m / 2 ** b
    return ceil(mean + sqrt(2 * mean * log(1200 / 1e-6)) + 2 / 3 * log(1200 / 1e-6))


fuse_table, fuse_where_s = kept
found = all(contains(fuse_table, fuse_where_s, fingerprint8, key) for key in big)
absent_big = make_keys(100_000, 5, avoid=set(big))
false = sum(contains(fuse_table, fuse_where_s, fingerprint8, key) for key in absent_big)
print(f"all stored keys found: {found}; false positives {false} of 100,000,"
      f" expected {100_000 / 256:.1f}, allowed {allowance(100_000, 8)}")
```

```{.text .output}
all stored keys found: True; false positives 392 of 100,000, expected 390.6, allowed 533
```

Five metrics are measured against the human reference (the authors' library) on the same machine,
five times each: **memory** kept by the filter, **construction time**, **lookup time** per query, the
**false-positive rate**, and the **space overhead** `100 × (bits per key / log2(1/ε) − 1)`. The
reference's memory follows from its layout. Its table has one byte per slot (two at 16 bits), plus a
40-byte struct:

```python
total, overheads = 0, []
for n in (10_000, 100_000, 1_000_000):
    for width in (1, 2):                       # bytes per slot: 8-bit and 16-bit fingerprints
        nbytes = fuse_layout(n)[2] * width + 40
        total += nbytes
        overheads.append(100 * (8 * nbytes / n / (8 * width) - 1))
print(f"mean memory {total / 6 / 1024:.1f} KiB")
print("space overhead at the nominal rate:", [f"{o:.1f}%" for o in overheads],
      f"mean {sum(overheads) / 6:.1f}%")
print(f"mean false-positive rate {(2 ** -8 + 2 ** -16) / 2 * 1000:.3f} x 10^-3")
```

```{.text .output}
mean memory 616.2 KiB
space overhead at the nominal rate: ['25.8%', '25.6%', '18.8%', '18.8%', '13.1%', '13.1%'] mean 19.2%
mean false-positive rate 1.961 x 10^-3
```

These match the leaderboard's reference row closely: 616.2 KiB, a measured 1.964 × 10⁻³, and 19.1%
measured overhead (ours uses the nominal rate). Small filters pay more overhead, since the
header gives them more slots per key.

**Pass rule.** To pass, a run must be strictly better than the reference on memory, construction
time and lookup time on **every** workload, and the false-positive rate and space overhead must not
be measurably worse (a statistical guard against private anchors). The **score** is the mean of
`100 × R / (C + R)` over all workloads and the three timed or counted metrics, where `C` is the
run's value and `R` the reference's. A copy of the reference scores about 50. With the means of
Claude Opus 5.5's run and of the reference measured in that run:

```python
def score(pairs):
    """pairs: (candidate, reference) for each metric; lower is better."""
    return sum(100 * r / (c + r) for c, r in pairs) / len(pairs)


opus = [(9.24, 18.9), (3.56, 4.23), (616.1, 616.2)]   # build ms, lookup ns, memory KiB
print(f"{score(opus):.1f}", [f"{100 * r / (c + r):.1f}" for c, r in opus])
```

```{.text .output}
57.2 ['67.2', '54.3', '50.0']
```

The task page gives 57.2. Twice as fast a build is worth 66.7 on that metric; a tie is worth 50.
The memory term is nearly a tie: the table's size is fixed by the layout, so the only bytes to win
are in the struct.

# What the agents did

Three of sixteen models passed; fourteen scored above the human reference (50.0). FDI 48.3 puts the
task 29th hardest of 48.

| Run | Build (ms) | Lookup (ns) | Memory (KiB) | FPR (×10⁻³) | Overhead (%) | Score | |
|---|---|---|---|---|---|---|---|
| Human reference | 18 | 3.95 | 616.2 | 1.964 | 19.1 | 50.0 | |
| Claude Opus 5.5 | 9.24 | 3.56 | 616.1 | 1.957 | 19.2 | 57.2 | pass |
| Gemini 4 Argon · Antigravity | 9.63 | 3.38 | 616.1 | 1.958 | 19.1 | 55.3 | pass |
| GPT-6.1 Sol | 14.9 | 3.08 | 616.1 | 1.961 | 19 | 53.9 | fail |
| GPT-6 Astra | 14.6 | 3.81 | 616.1 | 1.964 | 19.3 | 52.8 | pass |
| Kimi K3 | 15.8 | 3.84 | 616.2 | 1.964 | 19.2 | 50.4 | fail |

Means over the 144 hidden workloads, as of October 26, 2026.

**Claude Opus 5.5** had the best score. Its solution, from the task page, has five parts:

1. *Hash and layout.* Multiply the key by a random odd seed and fold the two halves of the 128-bit
   product. The high half picks the first slot; the fingerprint comes from other bits of the same
   product. The struct keeps fewer fields, which is where the memory win comes from.
2. *Counting and peeling.* For every slot, a count and the XOR of the keys' hashes, as in our
   `build`. The peeling queue is filled without branches, so the processor can overlap the work.
3. *Segment by segment.* For large sets, group the keys by the segment of their first slot. A
   segment is complete once its group has been added, so peeling runs right behind the adding while
   the data is still in cache. Incomplete segments carry a large extra count so they cannot look
   peelable.
4. *Assigning fingerprints* in reverse peeling order, prefetching the next keys' slots for large
   tables.
5. *Repeated keys,* below.

## Repeated keys

The task promises distinct keys, but a robust construction must not loop forever if a key repeats.
Two copies of a key always share all three slots: each slot counts at least 2, and their XOR
cancels. They can never be peeled, whatever the seed.

```python
dup = small + [small[0]]
for s in range(3):
    table, order = build(dup, 12, xor_where(12, s), fingerprint8)
    print(f"seed {s}: peeled {len(order)} of {len(dup)}")
table, order = build(sorted(set(dup)), 12, xor_where(12, seed), fingerprint8)   # the seed that peeled `small`
print("after removing the repeat:", table is not None)
```

```{.text .output}
seed 0: peeled 6 of 9
seed 1: peeled 5 of 9
seed 2: peeled 5 of 9
after removing the repeat: True
```

Checking for repeats means sorting, which is slow, so Claude Opus 5.5 sorts only when a failed attempt
leaves a slot whose two keys have equal hashes, or after a few failures.

::: pitfall
**A tie is not a win.** Kimi K3, Gemini 4 Argon · Pi and Step 5 Preview kept exactly the
reference's memory, 616.2 KiB, and so won memory on 0 of 144 workloads. GPT-6.1 Sol had the fastest
lookups on average (3.08 ns) but was slower than the reference on 1 of 144 workloads, and failed.
:::

# Summary and self-check

::: pattern
**Three lessons from the Theory task.**

1. *Theory sets the size.* The lower bound is `log2(1/ε)` bits per key; the layout decides how close
   a filter gets (Bloom 44% above it, xor 23%, binary fuse 13%). Code cannot beat the layout's table
   size, so the memory race is over a few struct bytes.
2. *Peeling is simple and fragile.* It succeeds only above a threshold of slots per key, and never
   with a repeated key.
3. *The engineering is in the cache.* The passing runs halved construction time by peeling segment by
   segment while the data is still in cache. Every workload had to win, and one slow lookup stream
   was enough to fail.
:::

## Exercises

1. Change the Bloom filter to `k = 3` and `k = 8` hashes. Which gives the fewest false positives at
   8 bits per key? Compare with `0.69 × 8`.
2. Peel the 8-key example by hand from the slot lists, and check the table against `contains`.
3. In the threshold experiment, use 20,000 keys. Is the cliff sharper?
4. Use `xor_where` with 1.17 slots per key for the 200,000 keys, and `fuse_where` with 1.10. What
   happens, and why?
5. A run builds twice as fast, looks up 10% slower and ties on memory. What is its score on one
   workload, and does it pass?
