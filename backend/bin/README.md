# Binarios locales de ffmpeg

En Azure App Service (Python/Oryx) **no** viene `ffmpeg`. El pipeline de deploy
ejecuta `scripts/fetch_ffmpeg_static.sh` y deja aquí `ffmpeg` + `ffprobe`.
La descarga usa el release de BtbN en GitHub; johnvansickle queda como respaldo.

También `startup.sh` puede instalarlos en `/home/site/tools/ffmpeg` si faltan.

No versionar los binarios (están en `.gitignore`).
