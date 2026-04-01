"""
Sous-processus : SeleniumBase (mode UC) charge l'URL et ecrit le HTML dans un fichier.

Pourquoi un fichier et pas stdout : les pages apres challenge Cloudflare depassent
souvent les limites de buffer du pipe ; l'ancienne approche HTML_START/END echouait
silencieusement.

Invocation depuis scrape_cascade : ``python selenium_fetch_to_file.py <out.html> <url>``
(chemin absolu vers ce script).

Dependance : ``seleniumbase`` (optionnelle si aucun site CF dur dans la liste).
"""
import sys
import time
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: selenium_fetch_to_file <out.html> <url>", file=sys.stderr)
        return 2
    out_path = Path(sys.argv[1])
    url = sys.argv[2]
    try:
        from seleniumbase import SB

        with SB(
            uc=True,
            headless=True,
            incognito=True,
            undetectable=True,
            do_not_track=True,
            disable_cookies=False,
            pls="none",
        ) as sb:
            sb.uc_open_with_reconnect(url, reconnect_time=14)
            try:
                sb.uc_gui_click_captcha()
            except Exception:
                pass
            time.sleep(10)
            for _ in range(8):
                sb.execute_script("window.scrollBy(0, 700)")
                time.sleep(1.8)
            time.sleep(3)
            html = sb.get_page_source()
        out_path.write_text(html, encoding="utf-8")
        print("OK")
        return 0
    except Exception as e:
        print(f"ERR:{e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
