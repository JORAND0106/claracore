Set-Location $PSScriptRoot
Compress-Archive -Path * -DestinationPath ../deploy.zip -Force
az webapp deploy --name claracore-backend --resource-group andres_jaimes82_rg_5760 --src-path ../deploy.zip --type zip
Remove-Item ../deploy.zip -Force