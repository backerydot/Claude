#!/usr/bin/env python3
"""Перевірка уроків хімії (chem/data/*.json).

Запуск з кореня проєкту:  python3 tools/check_chem.py
Перевіряє: унікальні id, обов'язкові поля, що відповідь є серед варіантів,
що кожне рівняння справді зрівняне коефіцієнтами з "answer" і вони найменші,
що формули розбираються на атоми, що дужки {…} у текстах закриті.
"""
import json
import math
import re
import sys
from functools import reduce
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "chem"
errors = []
warnings = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def atoms(f):
    """'Ca(OH)2' → {'Ca': 1, 'O': 2, 'H': 2}; None, якщо не розібрати."""
    s = f.split("^")[0].replace(" ", "")
    pos = 0

    def num():
        nonlocal pos
        m = re.match(r"\d+", s[pos:])
        if not m:
            return 1
        pos += len(m.group())
        return int(m.group())

    def group():
        nonlocal pos
        out = {}
        while pos < len(s) and s[pos] != ")":
            if s[pos] == "(":
                pos += 1
                inner = group()
                if pos >= len(s) or s[pos] != ")":
                    raise ValueError("bracket")
                pos += 1
                k = num()
                for el, n in inner.items():
                    out[el] = out.get(el, 0) + n * k
            else:
                m = re.match(r"[A-Z][a-z]?", s[pos:])
                if not m:
                    raise ValueError("char")
                pos += len(m.group())
                k = num()
                out[m.group()] = out.get(m.group(), 0) + k
        return out

    try:
        res = group()
        return res if pos == len(s) and res else None
    except ValueError:
        return None


ELEMENTS = {e["s"] for e in json.loads((ROOT / "data/elements.json").read_text())["elements"]}
ELEMENTS |= {"Ne", "He", "Ar", "Kr"}


def check_formula(where, f):
    a = atoms(f)
    if a is None:
        err(where, f"формула не розбирається: {f!r}")
        return None
    for el in a:
        if el not in ELEMENTS:
            warnings.append(f"{where}: елемент {el} не в таблиці elements.json ({f})")
    return a


def check_text(where, s):
    if s is None:
        return
    if s.count("{") != s.count("}"):
        err(where, f"незакриті фігурні дужки: {s[:60]!r}")
    for f in re.findall(r"\{([^}]+)\}", s):
        for tok in re.split(r"\s+|→|=|\+|⇄", f):
            tok = tok.strip()
            if not tok or not re.match(r"^\d*[A-Z(]", tok):
                continue
            body = re.sub(r"^\d+", "", tok)
            if atoms(body) is None:
                err(where, f"формула в тексті не розбирається: {tok!r}")


def check_ex(where, ex):
    t = ex.get("t")
    check_text(where, ex.get("q"))
    check_text(where, ex.get("explain"))
    if t == "choice":
        if ex.get("answer") not in ex.get("options", []):
            err(where, "відповіді немає серед варіантів")
        if len(set(ex.get("options", []))) != len(ex.get("options", [])):
            err(where, "однакові варіанти")
        for o in ex.get("options", []):
            check_text(where, o)
    elif t == "input":
        kind = ex.get("kind", "text")
        if not ex.get("answers"):
            err(where, "немає answers")
        if kind == "formula":
            for a in ex["answers"]:
                check_formula(where, a)
        if kind == "number":
            for a in ex["answers"]:
                try:
                    float(a)
                except (TypeError, ValueError):
                    err(where, f"не число: {a!r}")
    elif t == "balance":
        eq = ex.get("eq", "")
        if eq.count("=") != 1:
            err(where, f"у рівнянні має бути один '=': {eq!r}")
            return
        left, right = [[x.strip() for x in side.split("+")] for side in eq.split("=")]
        species = left + right
        ans = ex.get("answer")
        if not isinstance(ans, list) or len(ans) != len(species):
            err(where, f"answer має {len(species)} коефіцієнтів: {eq}")
            return
        parsed = [check_formula(where, f) for f in species]
        if None in parsed:
            return
        tot = [{}, {}]
        for k, (a, c) in enumerate(zip(parsed, ans)):
            side = 0 if k < len(left) else 1
            for el, n in a.items():
                tot[side][el] = tot[side].get(el, 0) + n * c
        if tot[0] != tot[1]:
            err(where, f"рівняння НЕ зрівняне з answer {ans}: {eq} → {tot}")
        if reduce(math.gcd, ans) != 1:
            err(where, f"коефіцієнти не найменші: {ans}")
    elif t == "sort":
        bins = ex.get("bins", [])
        for it in ex.get("items", []):
            check_text(where, it[0])
            if not (0 <= it[1] < len(bins)):
                err(where, f"неправильний номер групи: {it}")
    elif t == "match":
        pairs = ex.get("pairs", [])
        if len(pairs) < 3:
            err(where, "замало пар")
        for side in (0, 1):
            vals = [p[side] for p in pairs]
            if len(set(vals)) != len(vals):
                err(where, "однакові елементи в парах")
        for p in pairs:
            check_text(where, p[0])
            check_text(where, p[1])
    else:
        err(where, f"невідомий тип {t!r}")


def main():
    course = json.loads((ROOT / "data/course.json").read_text())
    ids = set()
    total = 0
    for sec in course["sections"]:
        path = ROOT / sec["file"]
        if not path.exists():
            print(f"Розділ {sec['id']} ще не написаний ({sec['file']})")
            continue
        data = json.loads(path.read_text())
        for l in data["lessons"]:
            total += 1
            w = f"{sec['file']} {l.get('id')}"
            if l.get("id") in ids:
                err(w, "id повторюється")
            ids.add(l.get("id"))
            for k in ("id", "num", "title", "par", "goals", "steps", "quiz"):
                if k not in l:
                    err(w, f"немає поля {k}")
            for g in l.get("goals", []):
                check_text(w, g)
            cards = 0
            for n, s in enumerate(l.get("steps", [])):
                ws = f"{w} крок {n + 1}"
                if s.get("t") == "card":
                    cards += 1
                    check_text(ws, s.get("title"))
                    check_text(ws, s.get("text"))
                    check_text(ws, s.get("tip"))
                    if s.get("example"):
                        check_text(ws, s["example"].get("text"))
                    for row in s.get("table", []):
                        for c in row:
                            check_text(ws, c)
                    if len(s.get("text", "")) > 700:
                        warnings.append(f"{ws}: довга картка ({len(s['text'])} символів)")
                else:
                    check_ex(ws, s)
            if cards == 0:
                err(w, "немає жодної картки теорії")
            q = l.get("quiz", [])
            if len(q) < 4:
                err(w, f"замало питань у контрольній ({len(q)})")
            for n, ex in enumerate(q):
                check_ex(f"{w} контрольна {n + 1}", ex)
    for wmsg in warnings:
        print("Увага:", wmsg)
    for e in errors:
        print("ПОМИЛКА:", e)
    print(f"Уроків: {total}. Помилок: {len(errors)}, попереджень: {len(warnings)}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
