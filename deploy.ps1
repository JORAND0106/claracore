param([string]$msg = "Actualización ClaraCore")
git add .
git commit -m $msg
git push origin main
Write-Host "✅ ClaraCore actualizado en Azure!" -ForegroundColor Green
```

Guarda con **Ctrl+S**.

Desde ahora para publicar cambios solo escribes en la terminal:
```
.\deploy.ps1 "descripción del cambio"
```

O simplemente:
```
.\deploy.ps1