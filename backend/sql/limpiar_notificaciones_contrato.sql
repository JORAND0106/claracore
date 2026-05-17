-- Limpieza del buzón por contrato (Supabase → SQL Editor).
-- El SELECT solo muestra filas; hay que ejecutar el DELETE por separado.

-- ① Ajusta el ID del contrato que quieres limpiar:
--    3 = contrato actual   |   2 = donde se crearon muchas pruebas

-- ② Vista previa (siempre ejecutar primero)
SELECT id, contrato_id, asunto, remitente_nombre, destinatario_id, created_at, leido
FROM notificaciones
WHERE contrato_id = 3
ORDER BY created_at DESC;

-- ③ Borrar mensajes de prueba en contrato 3 (descomenta y Run)
DELETE FROM notificaciones
WHERE contrato_id = 3
  AND (
    asunto ILIKE '%MENSAJE DE PRUEBA%'
    OR asunto ILIKE 'Re: MENSAJE DE PRUEBA%'
    OR asunto ILIKE 'hola%'
    OR asunto ILIKE 'HOLA%'
    OR asunto ILIKE 'boton camio%'
  );

-- ④ Si el buzón del contrato 3 debe quedar en cero (solo si estás seguro):
-- DELETE FROM notificaciones WHERE contrato_id = 3;

-- Nota: si los mensajes tienen contrato_id = 2, el DELETE con contrato_id = 3 no borra nada.
-- Revisa con:
-- SELECT contrato_id, COUNT(*) FROM notificaciones GROUP BY contrato_id ORDER BY 1;
