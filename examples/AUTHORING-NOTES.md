# Authoring notes

Record of the format risk test (delivery task 3.x): four real models written by
hand from the specification alone, before any editor existed. The point was to
find out whether CausalJSON is pleasant to author, since every other decision
sits downstream of that.

Models written: `smoking-cancer` (admg, front-door), `birthweight-paradox`
(dag, collider), `minimum-wage` (dag, instrument + scm layer), `burnout-loop`
(cld, feedback).

## What worked

- **Arrow shorthand carried most of the weight.** Two of four models are
  majority shorthand. `"smoking -> tar"` is what you actually want to type.
- **Object form when it earns it.** Dropping into object form for the one
  relation that needed an assertion felt natural rather than like a mode switch.
- **A minimal model is 6 lines** (`minimal.causal.json`), under the ~10 line
  target. Nothing is required that a sketch does not need.
- **The collider lint found the textbook error** in `birthweight-paradox`
  without being told what to look for.

## Friction found

1. **Nowhere to state the causal question.** Every model has an estimand — "the
   effect of X on Y adjusting for Z" — and it had to be smuggled into
   `meta.description` as prose. **Fixed:** added `meta.question`.

2. **`states` is unchecked against `type`.** A variable typed `binary` with
   three states validated happily. **Fixed:** added the `states-match-type`
   rule.

3. **Two ways to say "unmeasured confounding".** A latent node with two children
   and a bidirected edge encode the same thing. Both models needed one; nothing
   said which to reach for. **Fixed:** guidance added to the specification (§3.1).

4. **`role: "adjusted"` conflates model with analysis.** Which variables you
   adjust for is a property of the *question*, not of the causal structure — so
   a document can currently express only one adjustment strategy. Left as-is for
   0.1 (it matches DAGitty, which is the interoperability target) but recorded
   as a real design question.

5. **Identifier convention is unconstrained.** `maternal-smoking` and
   `policy_change` both validate. Harmless, but a model mixing both reads badly.
   Not fixed: a convention rule would be opinionated, and the schema should not
   legislate style.

6. **No way to subset relations in a view.** `include` subsets variables only.
   A figure that wants to show three of five edges between the same nodes cannot
   be expressed. Recorded for a later version.
