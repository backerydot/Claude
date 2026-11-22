#!/usr/bin/env python3
"""Перевірка навчального контенту в data/*.json.

Запуск із папки проєкту:  python3 tools/check_content.py

Шукає типові помилки: дублікати id, іменники без артикля чи множини,
відповідь у вправі «choice», якої немає серед варіантів, слова в «order»,
з яких не складається правильне речення, і шаблони відповідей у «question»,
під які не підходить навіть приклад.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTICLES = {"der", "die", "das"}
POS = {"n", "v", "adj", "adv", "pron", "prep", "conj", "num", "phr", "name"}
EX_TYPES = {"choice", "gap", "order", "translate"}

errors, warnings = [], []

# --- Така сама нормалізація, як у js/match.js ---
ONES = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn",
        "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"]
TENS = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"]


def number_to_german(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        t, o = divmod(n, 10)
        return f"{'ein' if o == 1 else ONES[o]}und{TENS[t]}" if o else TENS[t]
    if n < 1000:
        h, r = divmod(n, 100)
        return f"{'' if h == 1 else ONES[h]}hundert{number_to_german(r) if r else ''}"
    return str(n)


def normalize(text):
    s = str(text or "").lower()
    s = re.sub(r"\b\d{1,3}\b", lambda m: number_to_german(int(m.group())), s)
    for a, b in (("ß", "ss"), ("ä", "ae"), ("ö", "oe"), ("ü", "ue")):
        s = s.replace(a, b)
    s = re.sub(r"['’`´]", "", s)
    s = re.sub(r"[.,!?;:\"„“”«»()\[\]\-–—…/]", " ", s)
    return " ".join(s.split())


NUMBER = r"\S*(?:null|eins|zwei|drei|vier|fuenf|sechs|sieben|acht|neun|zehn|elf|zwoelf|zig|ssig|hundert)\S*"


def pattern_regex(pattern):
    marked = pattern.replace("*", "__any__").replace("#", "__num__")
    src = re.escape(normalize(marked)).replace("__any__", ".*").replace("__num__", NUMBER)
    return re.compile(f"^{src}$")


def check_word(w, where, seen_ids, prefix):
    for key in ("id", "de", "ua", "pos"):
        if not w.get(key):
            errors.append(f"{where}: у слова немає поля «{key}»: {w}")
    wid = w.get("id", "?")
    if wid in seen_ids:
        errors.append(f"{where}: id «{wid}» повторюється (уже є в {seen_ids[wid]})")
    seen_ids[wid] = where
    if not wid.startswith(prefix):
        warnings.append(f"{where}: id «{wid}» краще починати з «{prefix}»")
    if w.get("pos") not in POS:
        errors.append(f"{where}: «{wid}» має невідомий pos «{w.get('pos')}»")
    if w.get("pos") == "n":
        if w.get("art") not in ARTICLES:
            errors.append(f"{where}: іменник «{wid}» без артикля der/die/das")
        if not w.get("plOnly") and "pl" not in w:
            errors.append(f"{where}: іменник «{wid}» без множини (pl; для слів без множини — null)")
    elif w.get("art"):
        errors.append(f"{where}: «{wid}» має артикль, але pos не «n»")
    if bool(w.get("ex")) != bool(w.get("exUa")):
        errors.append(f"{where}: у «{wid}» має бути і ex, і exUa")


def check_exercise(ex, where):
    t = ex.get("type")
    if t not in EX_TYPES:
        errors.append(f"{where}: невідомий тип вправи «{t}»")
        return
    if t == "choice":
        if ex.get("answer") not in ex.get("options", []):
            errors.append(f"{where}: відповіді «{ex.get('answer')}» немає серед варіантів")
        if "___" not in ex.get("q", "") and not ex.get("say"):
            warnings.append(f"{where}: у питанні немає «___» — додай поле say, щоб озвучка звучала природно")
    elif t == "gap":
        if ex.get("q", "").count("___") != 1:
            errors.append(f"{where}: у вправі gap має бути рівно один «___»")
        if not ex.get("answers"):
            errors.append(f"{where}: у вправі gap немає answers")
    elif t == "order":
        words = sorted(normalize(" ".join(ex.get("words", []))).split())
        if not ex.get("answers") or not ex.get("ua"):
            errors.append(f"{where}: у вправі order потрібні answers і ua")
        for ans in ex.get("answers", []):
            if sorted(normalize(ans).split()) != words:
                errors.append(f"{where}: з карток {ex.get('words')} не складається «{ans}»")
    elif t == "translate":
        if not ex.get("ua") or not ex.get("answers"):
            errors.append(f"{where}: у вправі translate потрібні ua і answers")


def check_speak(s, where):
    if s.get("type") == "sentence":
        if not s.get("ua") or not s.get("answers"):
            errors.append(f"{where}: у реченні потрібні ua і answers")
    elif s.get("type") == "question":
        for key in ("de", "ua", "accept", "example"):
            if not s.get(key):
                errors.append(f"{where}: у питанні немає поля «{key}»")
        if s.get("accept") and s.get("example"):
            got = normalize(s["example"])
            if not any(pattern_regex(p).match(got) for p in s["accept"]):
                errors.append(f"{where}: приклад «{s['example']}» не підходить під жоден шаблон accept")
    else:
        errors.append(f"{where}: невідомий тип «{s.get('type')}» (буває sentence або question)")


def main():
    levels = json.loads((ROOT / "data/levels.json").read_text(encoding="utf-8"))
    seen_ids = {}
    total_words = 0
    for level in levels:
        if not level.get("file"):
            continue
        prefix = level["id"].lower().replace("+", "plus") + "-"
        data = json.loads((ROOT / level["file"]).read_text(encoding="utf-8"))
        lesson_ids = set()
        for lesson in data.get("lessons", []):
            lid = lesson.get("id", "?")
            where = f"{level['id']} {lid}"
            for key in ("id", "num", "title", "titleDe", "topic"):
                if key not in lesson:
                    errors.append(f"{where}: в уроці немає поля «{key}»")
            if lid in lesson_ids:
                errors.append(f"{where}: id уроку повторюється")
            lesson_ids.add(lid)
            if lesson.get("planned"):
                if not lesson.get("grammarPlan"):
                    warnings.append(f"{where}: у запланованого уроку немає grammarPlan")
                continue
            if not lesson.get("words") and not lesson.get("review"):
                errors.append(f"{where}: в уроці немає слів")
            if len(lesson.get("exercises", [])) < 5:
                warnings.append(f"{where}: менше 5 вправ")
            if len(lesson.get("speak", [])) < 3:
                warnings.append(f"{where}: менше 3 фраз для стрес-тесту")
            for w in lesson.get("words", []):
                check_word(w, where, seen_ids, prefix)
                total_words += 1
            for i, ex in enumerate(lesson.get("exercises", []), 1):
                check_exercise(ex, f"{where}, вправа {i}")
            for i, s in enumerate(lesson.get("speak", []), 1):
                check_speak(s, f"{where}, фраза {i}")
            # review — id слів з минулих уроків, які повторюємо в цьому (урок-фокус)
            for rid in lesson.get("review", []):
                if rid not in seen_ids:
                    errors.append(f"{where}: у review слово «{rid}», якого немає в попередніх уроках")
            scene = lesson.get("scene")
            if not scene:
                warnings.append(f"{where}: немає сцени (scene)")
            elif not scene.get("title") or not scene.get("lines"):
                errors.append(f"{where}: у сцені потрібні title і lines")
            for i, line in enumerate((scene or {}).get("lines", []), 1):
                for key in ("who", "de", "ua"):
                    if not line.get(key):
                        errors.append(f"{where}, сцена, репліка {i}: немає поля «{key}»")
            if not lesson.get("fact"):
                warnings.append(f"{where}: немає «Цікаво знати» (fact)")

    for w in warnings:
        print("⚠️ ", w)
    for e in errors:
        print("❌", e)
    print(f"\nСлів: {total_words}. Помилок: {len(errors)}, попереджень: {len(warnings)}.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
