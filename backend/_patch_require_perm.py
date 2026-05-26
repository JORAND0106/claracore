import re
path = "modulos_experimentales_routes.py"
text = open(path, encoding="utf-8").read()
text2, n = re.subn(
    r'_require_perm\(current_user, ("[^"]+"), ("[^"]+")\)',
    r"_require_perm(current_user, \1, \2, contrato_id)",
    text,
)
open(path, "w", encoding="utf-8").write(text2)
print("replaced", n)
