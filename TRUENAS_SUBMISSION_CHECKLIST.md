# AE NetScope - TrueNAS Submission Checklist

Este documento lista lo que AE NetScope debe completar antes de intentar subir la app al catalogo de TrueNAS. La meta no es solo que "arranque en Docker", sino que sea mantenible, segura, testeable y aceptable para una contribucion publica.

Fuentes oficiales revisadas:

- TrueNAS Apps contributing guide: https://apps.truenas.com/getting-started/contributing-to-apps/
- TrueNAS Apps repository: https://github.com/truenas/apps
- TrueNAS Apps `CONTRIBUTIONS.md`: https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md
- TrueNAS Apps custom YAML docs: https://apps.truenas.com/managing-apps/installing-custom-apps/

## Estado Actual

- AE NetScope aun no esta listo para ser enviado a TrueNAS upstream.
- Ya existe un Dockerfile de produccion, imagen publica en GHCR y `compose.yaml` local con AE NetScope, PostgreSQL y Redis.
- Ya existe un primer staging de app TrueNAS en `truenas/ix-dev/community/ae-netscope`.
- Falta validar la app dentro de un fork de `truenas/apps`, probarla en TrueNAS real, preparar icono/screenshots y confirmar aceptacion de licencia.

## 1. Preparar AE NetScope Para Produccion En Contenedor

- [x] Crear un `Dockerfile` de produccion para AE NetScope.
- [x] Construir frontend con Vite y servirlo desde la app final o desde un servidor web interno bien definido.
- [x] Ejecutar FastAPI con servidor ASGI apto para produccion.
- [x] Evitar dependencias de desarrollo dentro de la imagen final.
- [x] Crear un usuario no root dentro del contenedor.
- [x] Confirmar que la app puede correr con UID/GID configurable, idealmente compatible con el usuario `568` usado comunmente por apps de TrueNAS.
- [x] Exponer un solo puerto HTTP para la interfaz web y API.
- [x] Confirmar que `/api/health/live` y `/api/health/ready` funcionan dentro del contenedor.
- [x] Agregar healthcheck del contenedor usando el endpoint de readiness o liveness.
- [x] Hacer que las migraciones de base de datos se ejecuten de forma segura al iniciar.
- [ ] Definir estrategia de archivos estaticos, cache y compresion.
- [ ] Confirmar que la app funciona detras de proxy/reverse proxy.
- [ ] Confirmar que cookies seguras, CSRF y origenes CORS se configuran correctamente con variables de entorno.

## 2. Configuracion Por Variables De Entorno

- [x] Todas las configuraciones principales de produccion deben poder venir de variables de entorno.
- [x] No debe existir ningun secreto hardcodeado.
- [x] No debe existir ningun usuario o password real dentro del codigo.
- [ ] Definir variables obligatorias para produccion:
  - [x] `APP_ENV=production`
  - [x] `APP_URL`
  - [x] `APP_WEB_DIST_DIR`
  - [x] `API_CORS_ORIGINS`
  - [x] `DATABASE_URL`
  - [x] `REDIS_HOST`
  - [x] `REDIS_PORT`
  - [x] `REDIS_DB`
  - [x] `REDIS_PASSWORD`
  - [x] `SESSION_SECRET`
  - [x] `SESSION_COOKIE_SECURE`
  - [x] `AUTH_RATE_LIMIT_PER_MINUTE`
  - [x] `AUTH_FAILED_LOGIN_LIMIT`
- [ ] Definir variables opcionales para bootstrap inicial:
  - [ ] `AE_NETSCOPE_ADMIN_EMAIL`
  - [ ] `AE_NETSCOPE_ADMIN_USERNAME`
  - [ ] `AE_NETSCOPE_ADMIN_PASSWORD`
- [ ] Si se usan variables de bootstrap, deben aplicar solo cuando no exista ningun usuario admin.
- [x] Documentar que los passwords deben pasarse como secretos/valores privados, no en archivos committeados.

## 3. PostgreSQL Y Redis

- [ ] Confirmar que la app no depende de SQLite en produccion.
- [x] Probar arranque limpio con PostgreSQL desde cero.
- [x] Probar migraciones sobre PostgreSQL.
- [x] Probar reinicio de la app sin perdida de datos.
- [x] Probar Redis real para rate limit y sesiones/cache si aplica.
- [x] Decidir si Redis requiere persistencia o puede tratarse como cache efimera.
- [ ] Preparar timeouts y reintentos razonables para DB y Redis.
- [ ] Confirmar que `/api/health/ready` falla si PostgreSQL o Redis no estan disponibles.

## 4. Seguridad Minima Antes De TrueNAS

- [ ] Ejecutar revision completa de secretos en el repo.
- [ ] Confirmar que `.env`, `.env.*`, bases locales y archivos temporales estan ignorados.
- [ ] Confirmar que `.env.example` no contiene secretos reales.
- [ ] Confirmar que la imagen no incluye `.git`, `.env`, bases locales ni caches.
- [ ] Mantener Argon2id para passwords.
- [ ] Mantener cookies HttpOnly.
- [ ] Activar cookies secure en produccion.
- [ ] Mantener CSRF para acciones autenticadas.
- [x] Mantener rate limit con Redis.
- [ ] Confirmar bloqueo/desbloqueo de usuarios desde admin.
- [ ] Confirmar que el admin puede revocar sesiones.
- [ ] Confirmar que no hay bypass de permisos en endpoints de inventario, usuarios, auditoria y exportacion.
- [ ] Agregar tests de permisos negativos para endpoints criticos.
- [ ] Agregar cabeceras de seguridad HTTP si aun no estan aplicadas.
- [ ] Revisar logs para evitar imprimir passwords, tokens, cookies o cadenas de conexion completas.

## 5. Imagen Publica

- [x] Publicar imagen en GHCR o registro equivalente.
- [x] Usar ruta publica actual `ghcr.io/whiteassassins/ae-netscope`.
- [x] Usar tags versionados, por ejemplo `v0.1.3-alpha`.
- [x] Evitar depender solo de `latest`.
- [x] Generar imagen linux/amd64.
- [ ] Si se puede, preparar multi-arch linux/amd64 y linux/arm64.
- [ ] Agregar labels OCI:
  - [x] `org.opencontainers.image.title`
  - [x] `org.opencontainers.image.description`
  - [x] `org.opencontainers.image.source`
  - [x] `org.opencontainers.image.licenses` debe reflejar la licencia source-available propietaria de AE NetScope, no MIT/Apache/GPL.
  - [x] `org.opencontainers.image.version`
- [ ] Ejecutar escaneo de vulnerabilidades de la imagen.
- [ ] Definir politica de actualizacion de tags.

## 6. Pruebas Locales Antes Del Catalogo TrueNAS

- [x] Crear un `compose.yaml` de produccion local para AE NetScope, PostgreSQL y Redis.
- [x] Probar `docker compose up` desde cero.
- [x] Probar instalacion limpia sin datos previos.
- [x] Probar reinicio con volumen persistente.
- [ ] Probar actualizacion entre dos versiones.
- [ ] Probar recuperacion si PostgreSQL tarda en iniciar.
- [ ] Probar que readiness no responde OK hasta que dependencias esten listas.
- [ ] Probar login inicial, cambio de password, usuarios, roles, inventario, exportacion y auditoria.
- [ ] Probar con una URL publica o dominio local simulando reverse proxy.
- [ ] Probar con cookies secure activadas.

## 7. Preparar Contribucion En `truenas/apps`

- [ ] Revisar issues existentes para evitar duplicar trabajo.
- [ ] Revisar PRs abiertos relacionados.
- [ ] Abrir issue o draft PR temprano si la app aun no existe.
- [ ] Hacer fork de `https://github.com/truenas/apps`.
- [x] Crear staging de la app en `truenas/ix-dev/community/ae-netscope`.
- [ ] No editar archivos auto-generados fuera de `ix-dev/` o `library/`.
- [x] Usar una app similar como base, idealmente una app web con PostgreSQL y Redis.

## 8. Archivos Requeridos Por TrueNAS

Dentro de `ix-dev/community/ae-netscope` deben existir:

- [x] `app.yaml`
- [x] `ix_values.yaml`
- [x] `questions.yaml`
- [x] `README.md`
- [x] `templates/docker-compose.yaml`
- [x] `templates/test_values/basic-values.yaml`

Archivos opcionales segun necesidad:

- [ ] `app_migrations.yaml`
- [ ] `migrations/`
- [ ] mas archivos en `templates/test_values/` para escenarios extra.

## 9. `app.yaml`

- [x] `name` debe ser `ae-netscope`.
- [x] `title` debe ser `AE NetScope`.
- [x] `train` debe ser `community`.
- [x] `version` debe empezar en `1.0.0` para la definicion de app TrueNAS.
- [x] `app_version` debe coincidir con la version real de AE NetScope o tag de imagen.
- [x] `description` debe ser corta y clara.
- [x] `home` debe apuntar al sitio del proyecto.
- [x] `sources` debe apuntar al repo publico.
- [x] `keywords` debe incluir terminos como `network`, `inventory`, `lan`, `sysadmin`.
- [x] `categories` debe usar una categoria aceptada por el catalogo.
- [ ] `icon` debe usar una URL valida cuando TrueNAS la proporcione/suba a CDN.
- [ ] `screenshots` deben estar preparadas para adjuntar en PR o usar URLs finales del CDN.
- [x] `run_as_context` debe documentar UID/GID no root.
- [x] `capabilities` debe estar vacio salvo que sea estrictamente necesario.
- [x] `host_mounts` debe estar vacio salvo que sea estrictamente necesario.

## 10. `ix_values.yaml`

- [x] Definir imagen principal de AE NetScope.
- [x] Definir imagen de PostgreSQL si se usa dependencia incluida.
- [x] Definir imagen de Redis si se usa dependencia incluida.
- [x] Las claves de imagen deben terminar en `image`.
- [x] Preferir GHCR sobre Docker Hub si aplica.
- [x] Usar tags exactos.
- [x] Definir constantes para nombres de contenedores.
- [x] Definir constantes para usuario, base de datos y rutas internas.
- [x] No guardar passwords ni secretos reales.

## 11. `questions.yaml`

- [x] Crear grupo de configuracion de AE NetScope.
- [x] Crear grupo de red.
- [x] Crear grupo de almacenamiento.
- [x] Crear grupo de recursos.
- [x] Crear grupo de labels si aplica.
- [x] Puerto web configurable.
- [x] Configuracion de dominio/origen publico.
- [x] Configuracion de secure cookies.
- [x] Variables sensibles marcadas como privadas.
- [x] Validar minimos/maximos de puertos.
- [ ] Validar formato de email admin si TrueNAS schema lo permite.
- [ ] No pedir configuraciones innecesarias al usuario final.
- [x] Defaults seguros y razonables.

## 12. `templates/docker-compose.yaml`

- [x] Usar la libreria de renderizado de TrueNAS.
- [x] Crear contenedor principal de AE NetScope.
- [x] Configurar usuario no root.
- [x] Configurar environment desde valores de TrueNAS.
- [x] Agregar puerto web.
- [x] Agregar healthcheck.
- [x] Agregar portal para Web UI.
- [x] Agregar dependencia PostgreSQL usando la libreria si corresponde.
- [x] Agregar dependencia Redis usando la libreria si corresponde.
- [x] Agregar volumen persistente para PostgreSQL.
- [x] Agregar volumen persistente o efimero para Redis segun decision.
- [x] Usar `depends_on` con `service_healthy` donde aplique.
- [x] Evitar privilegios elevados.
- [x] Evitar `network_mode: host` salvo necesidad real.
- [x] Evitar mounts del host salvo necesidad real.

## 13. `templates/test_values`

- [x] Crear `basic-values.yaml`.
- [x] Usar puerto publicado no privilegiado.
- [x] Incluir todos los valores requeridos por `questions.yaml`.
- [x] Incluir valores de almacenamiento.
- [x] Incluir limites de CPU y memoria.
- [ ] Agregar otro test si existe modo con host path.
- [ ] Agregar otro test si existe configuracion alternativa importante.

## 14. Pruebas Con El Repo De TrueNAS

Comandos esperados dentro del fork de `truenas/apps`:

```bash
./.github/scripts/ci.py --app ae-netscope --train community --test-file basic-values.yaml --render-only=true
./.github/scripts/ci.py --app ae-netscope --train community --test-file basic-values.yaml
./.github/scripts/ci.py --app ae-netscope --train community --test-file basic-values.yaml --wait=true
```

- [ ] Renderizar compose sin errores.
- [ ] Desplegar app sin errores.
- [ ] Esperar healthcheck sano.
- [ ] Entrar manualmente a la Web UI durante `--wait=true`.
- [ ] Probar login y flujo inicial.
- [ ] Probar persistencia tras reiniciar contenedores.
- [ ] Validar que el compose generado no incluye secretos inesperados.

## 15. Documentacion Para Usuarios TrueNAS

- [x] README corto dentro de la app TrueNAS.
- [x] Descripcion clara de que AE NetScope es inventario LAN/sysadmin.
- [ ] Instrucciones de primer login.
- [ ] Explicar que PostgreSQL guarda datos persistentes.
- [x] Explicar si Redis es cache o persistente.
- [ ] Explicar como resetear admin de forma segura si se implementa.
- [ ] Preparar capturas limpias sin datos reales.
- [ ] Preparar icono cuadrado de buena calidad.
- [ ] Preparar texto para recursos del App Market si se solicita.

## 16. `.gitignore` Y Archivos Que No Deben Subirse

En este repo de AE NetScope deben seguir ignorados:

- [ ] `.env`
- [ ] `.env.*`
- [ ] Bases locales como `api/var/`
- [ ] Passwords locales como `api/.local-*`
- [ ] Entornos virtuales como `.venv/`
- [ ] `node_modules/`
- [ ] Builds locales como `dist/`, `build/`
- [ ] Caches de test/lint como `.pytest_cache/`, `.ruff_cache/`, `.coverage`, `htmlcov/`
- [ ] Logs y temporales.

Cuando trabajemos dentro del fork de `truenas/apps`, no deben commitearse:

- [ ] `templates/rendered/`
- [ ] Compose renderizado temporal.
- [ ] Archivos `.env`.
- [ ] Volumenes locales.
- [ ] Capturas con informacion sensible.
- [ ] Test values con secretos reales.
- [ ] Archivos generados fuera de las rutas permitidas por TrueNAS.

## 17. Revision Final Antes De PR

- [ ] Tests backend pasan.
- [ ] Lint backend pasa.
- [ ] Build frontend pasa.
- [ ] Lint frontend pasa.
- [ ] Imagen de produccion construye sin errores.
- [ ] Compose local de produccion funciona.
- [x] Imagen publicada con tag versionado.
- [ ] Escaneo de secretos limpio.
- [ ] Escaneo de vulnerabilidades revisado.
- [ ] Documentacion publica actualizada.
- [ ] Licencia visible y coherente con distribucion publica source-available propietaria.
- [ ] Confirmar si TrueNAS acepta la licencia de AE NetScope antes de abrir PR final.
- [ ] Confirmar que la publicacion en catalogo no concede derechos de reventa, sublicencia, hosting comercial o marketplace fuera del permiso escrito del propietario.
- [ ] No hay datos personales o internos en screenshots, ejemplos o logs.
- [ ] PR en TrueNAS explica que AE NetScope usa PostgreSQL y Redis.
- [ ] PR incluye notas de instalacion si los mantenedores las necesitan.
- [ ] PR adjunta icono y screenshots si aun no estan en CDN.

## Orden Recomendado De Trabajo

1. Crear imagen de produccion de AE NetScope.
2. Crear compose local con PostgreSQL y Redis.
3. Endurecer configuracion de produccion por variables de entorno.
4. Probar migraciones y persistencia.
5. Publicar imagen versionada en GHCR.
6. Preparar fork de `truenas/apps`.
7. Crear `ix-dev/community/ae-netscope`.
8. Implementar metadata, questions y template compose.
9. Ejecutar CI local de TrueNAS.
10. Abrir draft PR.
