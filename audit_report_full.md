# Medidator — Informe de Auditoría de Datos (Audit Report Full)

**Fecha:** 2026-04-20 12:17:36
**Job:** `1775737734261`
**Pipeline:** stage8_logistics.json (14,324 productos)

---
## RESUMEN EJECUTIVO

Se ejecutaron **10 auditorías exhaustivas** sobre el output del pipeline de logística de Medidator.

### Datos analizados
| Métrica | Valor |
|---------|-------|
| Productos totales (stage8) | 14,324 |
| Productos con vol_logistico | 14,324 |
| Vol total pipeline | 5617.79 m³ |
| Productos en stage1 | 14,373 |
| Productos en stage4 | 14,373 |

### Distribución por capa
| Capa | Layer | Productos | % |
|------|-------|-----------|---|
| 3 | `ratio_subfamilia` | 5,591 | 39.0% |
| 4 | `promedio_subfamilia` | 2,962 | 20.7% |
| 1 | `erp_ground_truth` | 2,685 | 18.7% |
| 2 | `gemini_embalaje` | 2,237 | 15.6% |
| 4 | `promedio_subfamilia_corregido` | 468 | 3.3% |
| 3 | `ratio_desde_descripcion_fix5` | 298 | 2.1% |
| 3 | `ratio_composicion_ancho_fix8` | 56 | 0.4% |
| 3 | `ratio_residual_fix7` | 8 | 0.1% |
| 4 | `promedio_tipo` | 8 | 0.1% |
| 3 | `ratio_subfamilia_corregido_fix4` | 7 | 0.0% |
| 3 | `ratio_tipo` | 4 | 0.0% |

### Hallazgos críticos
| Auditoría | Productos flagados | Severidad |
|-----------|-------------------|-----------|
| Audit 1 (outliers categoría) | 2,845 | MEDIA |
| Audit 2 (dispersión intra-grupo >10x) | 12,022 | ALTA |
| Audit 3 (ratio vol_logistico/vol_producto fuera de [0.1, 8]) | 699 | ALTA |
| Audit 4 (vol repetido en >20 productos dispares) | 3,492 | MEDIA |
| Audit 5 (suppliers sospechosos top20) | 1,411 | MEDIA |
| Audit 6 (violaciones rango esperado) | 819 | ALTA |
| Audit 7 (Gemini sospechoso) | 996 | ALTA |
| Audit 8 (ratio extremo >12x o <0.05x) | 864 | MUY ALTA |
| **Total CODs únicos con ≥1 flag** | **13,405** | — |
| **Top 100 sospechosos globales** | **100** | — |

**93.6%** de los productos con volumen tienen al menos 1 flag de auditoría.

> **NOTA IMPORTANTE sobre la tasa de flags**: El 93.6% está inflado principalmente por el **Audit 2** (dispersión intra-grupo), que flagea 12,022 productos. El motivo es que los grupos de supplier con Programa="NINGUNO" agrupan incorrectamente productos de categorías radicalmente distintas (p.ej. el supplier `00860` mezcla cuadros de 0.0001 m³ con sofás de 6.28 m³ dando un ratio de 62,822x). Esto no indica error en el vol_logistico de esos productos individualmente — indica que el criterio de agrupamiento es demasiado amplio. Los flags **realmente accionables** son los de Audits 3, 6, 7 y 8, que afectan a **~2,500 productos** con errores concretos.

### Fixes propuestos
Se identificaron **7 fixes** accionables:
- **Fix9** (ALTA): Cap electros fuera de rango físico esperado — ~819 productos
- **Fix10** (ALTA): Invalidar respuestas Gemini donde ratio_embalaje/producto < 1.2 — ~996 productos
- **Fix11** (ALTA): Invalidar vol_logistico cuando ratio paquete/producto > 12x — ~833 productos
- **Fix12** (ALTA): Invalidar vol_logistico cuando ratio paquete/producto < 0.05x — ~31 productos
- **Fix13** (MEDIA): Normalizar series con dispersión extrema (ratio max/min > 50x) — ~10,474 productos
- **Fix14** (MEDIA): Revisar TVs fuera de rango [0.03, 0.80] m³ — ~22 productos
- **Fix15** (BAJA): Revisar colchones fuera de rango [0.08, 0.90] m³ — ~55 productos

---
## AUDIT 1 — Coherencia por Categoría

Clasificación por palabras clave en descripción. Estadísticas de vol_logistico por categoría.

### Estadísticas por categoría (ordenado por mediana DESC)

| Categoría | N | Min | P10 | P25 | Mediana | P75 | P90 | Max | Media | Total m³ |
|-----------|---|-----|-----|-----|---------|-----|-----|-----|-------|----------|
| SOFA_GRANDE | 821 | 0.0139 | 0.7229 | 0.8832 | 1.4665 | 2.4113 | 2.8117 | 5.7684 | 1.6655 | 1367.35 |
| COMPOSICION | 110 | 0.0580 | 0.1496 | 0.2786 | 1.1199 | 1.3976 | 2.5673 | 4.4800 | 1.0890 | 119.79 |
| SOFA_CAMA | 121 | 0.2230 | 0.4260 | 0.5750 | 1.0852 | 1.6932 | 1.8629 | 6.2822 | 1.2479 | 150.99 |
| FRIGO | 403 | 0.0200 | 0.1014 | 0.5000 | 0.7838 | 0.9728 | 1.1674 | 1.4868 | 0.7238 | 291.71 |
| CAMA | 302 | 0.0400 | 0.2579 | 0.5820 | 0.7568 | 0.9730 | 1.0811 | 5.9006 | 0.7815 | 236.01 |
| LITERA | 22 | 0.0010 | 0.3330 | 0.7099 | 0.7099 | 3.3132 | 3.9830 | 4.1311 | 1.8338 | 40.34 |
| COLCHON | 469 | 0.0036 | 0.2306 | 0.3604 | 0.5592 | 0.7700 | 0.9009 | 2.0400 | 0.5698 | 267.23 |
| EXTERIOR | 30 | 0.0081 | 0.0684 | 0.1750 | 0.5249 | 1.0180 | 1.1648 | 2.2646 | 0.6492 | 19.48 |
| MESA_COMEDOR | 183 | 0.0233 | 0.2350 | 0.2786 | 0.4475 | 0.8073 | 1.1405 | 1.8710 | 0.5945 | 108.79 |
| ARMARIO | 307 | 0.0194 | 0.1237 | 0.1318 | 0.3848 | 0.7508 | 1.6341 | 2.9488 | 0.6159 | 189.07 |
| MESA_ESCRITORIO | 127 | 0.0005 | 0.0760 | 0.1236 | 0.3710 | 0.5463 | 0.7099 | 1.3975 | 0.3890 | 49.40 |
| LAVAVAJILLAS | 156 | 0.0054 | 0.2684 | 0.2934 | 0.3698 | 0.3860 | 0.3891 | 0.4358 | 0.3331 | 51.97 |
| APARADOR | 209 | 0.0648 | 0.1901 | 0.2786 | 0.3672 | 0.4411 | 0.5522 | 0.9800 | 0.3775 | 78.91 |
| VITRINA | 122 | 0.1089 | 0.2296 | 0.3655 | 0.3672 | 0.5842 | 1.2012 | 1.5246 | 0.5222 | 63.71 |
| LAVADORA | 343 | 0.0280 | 0.2701 | 0.3062 | 0.3495 | 0.3877 | 0.4130 | 0.7980 | 0.3536 | 121.30 |
| SILLA | 1,468 | 0.0050 | 0.1351 | 0.1880 | 0.2694 | 0.4517 | 0.7578 | 3.1728 | 0.3640 | 534.34 |
| COMODA | 151 | 0.0246 | 0.0820 | 0.1318 | 0.2447 | 0.3848 | 0.3980 | 0.7484 | 0.2510 | 37.91 |
| MUEBLE_TV | 178 | 0.0002 | 0.1652 | 0.1960 | 0.2326 | 0.2786 | 0.3212 | 0.6210 | 0.2423 | 43.13 |
| ALFOMBRA | 68 | 0.0001 | 0.0253 | 0.2306 | 0.2306 | 0.2306 | 0.2306 | 0.2306 | 0.1915 | 13.02 |
| TEXTIL | 125 | 0.0031 | 0.0155 | 0.0800 | 0.2306 | 0.2306 | 0.2306 | 0.9489 | 0.2081 | 26.01 |
| TV | 282 | 0.0011 | 0.0510 | 0.0973 | 0.2038 | 0.3799 | 0.6355 | 1.4773 | 0.2799 | 78.92 |
| MESA_CENTRO | 359 | 0.0100 | 0.0570 | 0.1035 | 0.2020 | 0.3672 | 0.3672 | 0.7720 | 0.2155 | 77.35 |
| HORNO_PLACA | 292 | 0.0100 | 0.0419 | 0.0572 | 0.1938 | 0.2853 | 0.3074 | 0.7600 | 0.1817 | 53.05 |
| LAMPARA | 161 | 0.0010 | 0.0541 | 0.0961 | 0.1763 | 0.2883 | 0.4924 | 1.8917 | 0.2404 | 38.71 |
| CAMPANA | 158 | 0.0273 | 0.0546 | 0.0924 | 0.1673 | 0.2447 | 0.3416 | 0.4800 | 0.1829 | 28.89 |
| LIBRERIA | 206 | 0.0152 | 0.0497 | 0.0990 | 0.1318 | 0.3505 | 0.6595 | 1.9670 | 0.2758 | 56.81 |
| CABECERO | 192 | 0.0001 | 0.0355 | 0.0656 | 0.1290 | 0.3848 | 0.4051 | 0.7099 | 0.2256 | 43.31 |
| MESITA | 195 | 0.0018 | 0.0233 | 0.0600 | 0.1230 | 0.3848 | 0.7099 | 0.9000 | 0.2289 | 44.63 |
| OTRO | 4,563 | 0.0001 | 0.0045 | 0.0490 | 0.1199 | 0.3662 | 0.6633 | 4.7923 | 0.2631 | 1200.51 |
| CUADRO | 126 | 0.0000 | 0.0105 | 0.0438 | 0.1089 | 0.1666 | 0.5780 | 0.9459 | 0.1781 | 22.45 |
| DECORACION | 139 | 0.0002 | 0.0026 | 0.0143 | 0.1089 | 0.1199 | 0.2694 | 3.6883 | 0.2302 | 32.00 |
| RECIBIDOR | 232 | 0.0006 | 0.0400 | 0.0658 | 0.1089 | 0.1537 | 0.2486 | 0.8490 | 0.1265 | 29.34 |
| CLIMA | 238 | 0.0018 | 0.0243 | 0.0502 | 0.0957 | 0.0957 | 0.1015 | 1.7000 | 0.0964 | 22.95 |
| MENAJE | 367 | 0.0007 | 0.0407 | 0.0816 | 0.0816 | 0.0816 | 0.0816 | 0.3891 | 0.0773 | 28.38 |
| MICROONDAS | 138 | 0.0100 | 0.0391 | 0.0540 | 0.0732 | 0.1097 | 0.1291 | 0.4079 | 0.0839 | 11.58 |
| ESPEJO | 176 | 0.0001 | 0.0002 | 0.0100 | 0.0513 | 0.1199 | 0.1285 | 0.7700 | 0.0729 | 12.83 |
| ASPIRADOR | 33 | 0.0197 | 0.0240 | 0.0301 | 0.0409 | 0.0540 | 0.0774 | 0.2329 | 0.0495 | 1.63 |
| PEQ_ELECTRO | 268 | 0.0008 | 0.0072 | 0.0165 | 0.0353 | 0.0600 | 0.0816 | 0.4861 | 0.0535 | 14.33 |
| CALEFACCION | 155 | 0.0030 | 0.0077 | 0.0125 | 0.0302 | 0.0563 | 0.1036 | 0.3076 | 0.0470 | 7.29 |
| AUDIO | 34 | 0.0001 | 0.0007 | 0.0018 | 0.0082 | 0.0477 | 0.1278 | 0.1648 | 0.0386 | 1.31 |
| CUIDADO_PERSONAL | 1 | 0.0012 | 0.0012 | 0.0012 | 0.0012 | 0.0012 | 0.0012 | 0.0012 | 0.0012 | 0.00 |
| MOVIL | 294 | 0.0001 | 0.0001 | 0.0004 | 0.0006 | 0.0011 | 0.0011 | 0.1368 | 0.0036 | 1.06 |

### Categorías con P10 < 0.01 m³ (sospechosas de tinys)

| Categoría | P10 | N |
|-----------|-----|---|
| MOVIL | 0.0001 | 294 |
| ESPEJO | 0.0002 | 176 |
| AUDIO | 0.0007 | 34 |
| CUIDADO_PERSONAL | 0.0012 | 1 |
| DECORACION | 0.0026 | 139 |
| OTRO | 0.0045 | 4,563 |
| PEQ_ELECTRO | 0.0072 | 268 |
| CALEFACCION | 0.0077 | 155 |

### Outliers intra-categoría (fuera de [P10, P90])
Total: 2,845 productos

Top 30 con mayor impacto:

| COD | Descripción | Categoría | Vol | P10 | P90 | Capa | Layer |
|-----|-------------|-----------|-----|-----|-----|------|-------|
| `00860001015228` | CAMA POLIESTER METAL 196X223X135 180X200 | CAMA | 5.9006 | 0.2579 | 1.0811 | 3 | `ratio_subfamilia` |
| `00860001015246` | SOFA CAMA POLIESTER 285X260X90 BEIGE     | SOFA_CAMA | 6.2822 | 0.4260 | 1.8629 | 3 | `ratio_subfamilia` |
| `00860001013454` | CAMA MADERA METAL 187X210X137 CAPITONE R | CAMA | 5.3800 | 0.2579 | 1.0811 | 3 | `ratio_subfamilia` |
| `00860001013455` | CAMA MADERA METAL 200X220X120 CAPITONE G | CAMA | 5.2800 | 0.2579 | 1.0811 | 3 | `ratio_subfamilia` |
| `00860001015247` | SOFA CAMA POLIESTER 307X242X86 CHAISELON | SOFA_CAMA | 6.0187 | 0.4260 | 1.8629 | 3 | `ratio_subfamilia` |
| `00860001015259` | CAMA MANGO 165X212X137 69,30 NATURAL     | OTRO | 4.7923 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00860001015756` | BANCO ACERO 215X120X180 COLUMPIO 3 PLAZA | OTRO | 4.6394 | 0.0045 | 0.6633 | 3 | `ratio_desde_descripcion_fix5` |
| `00860001014209` | CAMA CHILL OUT RATAN SINTETICO ACERO 175 | OTRO | 4.4362 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00159001010365` | SET DINAMARCA CORNER ANTRACITA 1 CORNER  | OTRO | 4.4138 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00159001010366` | SET DINAMARCA CORNER BLANCO 1 CORNER 271 | OTRO | 4.4138 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00860001013545` | BANCO ACERO POLIESTER 210X120X167 COLUMP | OTRO | 4.2042 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00860001013546` | BANCO ACERO POLIESTER 210X120X167 COLUMP | OTRO | 4.2042 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `04376001010354` | CAMA TREN MOD.DONALD PUCCINI-ANDERSEN DO | OTRO | 4.1732 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `04376001010659` | CAMA TREN MOD.DONALD *** NO USAR *** | OTRO | 4.1732 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00860001014743` | ARBOL LED PVC 132X132X210 350L 1132 RAMA | DECORACION | 3.6883 | 0.0026 | 0.2694 | 3 | `ratio_subfamilia` |
| `00860001015195` | ARBOL LED PVC 132X132X210 320L 1036 RAMA | DECORACION | 3.6883 | 0.0026 | 0.2694 | 3 | `ratio_subfamilia` |
| `04315001010107` | CAMA TREN 3 CAMAS BLANCO/NATURAL 150X242 | OTRO | 4.0253 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00784001013267` | CAMA BEIGE TEJIDO DORMITORIO 160 X 217 X | OTRO | 3.7150 | 0.0045 | 0.6633 | 1 | `erp_ground_truth` |
| `00860001015220` | SOFA POLIESTER MADERA 235X303X86 GRIS CL | SOFA_GRANDE | 5.7684 | 0.7229 | 2.8117 | 3 | `ratio_subfamilia` |
| `00784001013268` | CAMA BEIGE TEJIDO DORMITORIO 160 X 217 X | OTRO | 3.2640 | 0.0045 | 0.6633 | 1 | `erp_ground_truth` |
| `00860001011817` | SILLON RATAN SINT. 133X120X199 250KG MAX | SILLA | 3.1728 | 0.1351 | 0.7578 | 3 | `ratio_subfamilia` |
| `00860001015193` | ARBOL LED PE 120X120X180 340LEDS VERDE   | DECORACION | 2.6127 | 0.0026 | 0.2694 | 3 | `ratio_subfamilia` |
| `04887001010143` | PINO YELLOWSTONE NATURALE D128X180H 0980 | OTRO | 2.9727 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `01127001000217` | RINCONERA DER.L295X215X84/106 CM, 3 ASIE | SOFA_GRANDE | 5.0187 | 0.7229 | 2.8117 | 3 | `ratio_subfamilia` |
| `01127001000218` | RINCONERA IZQ.L295X215X84/106 CM, 3 ASIE | SOFA_GRANDE | 5.0187 | 0.7229 | 2.8117 | 3 | `ratio_subfamilia` |
| `04443001010129` | CHAISSE LONGUE 300 CM DERECHA MAURO SERI | OTRO | 2.8486 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `04443001010130` | CHAISSE LONGUE 300 CM IZQUIERDA MAURO SE | OTRO | 2.8486 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |
| `00860001014742` | ARBOL LED PVC 116X116X180 250L 772 RAMAS | DECORACION | 2.4415 | 0.0026 | 0.2694 | 3 | `ratio_subfamilia` |
| `01545001010034` | CONJUNTO 3PZ.+ 2 PZ. TELA GREEN PERLA YU | OTRO | 2.8200 | 0.0045 | 0.6633 | 1 | `erp_ground_truth` |
| `01067001010148` | MOD.3 PZ.C/BR+CHAIS 3PZ.DCHA(304)2 MOTOR | OTRO | 2.8021 | 0.0045 | 0.6633 | 3 | `ratio_subfamilia` |

---
## AUDIT 2 — Dispersión dentro de Grupos por Serie

Agrupa por (primeros 5 dígitos de COD + Programa/Linea). Grupos con ≥4 productos y max/min >10x.

Total grupos con dispersión >10x: 102

### Top 30 grupos con mayor dispersión intra-grupo

| Grupo | N | Min | Max | Ratio | Mediana | Ejemplos COD |
|-------|---|-----|-----|-------|---------|--------------|
| `00860__NINGUNO` | 1767 | 0.0001 | 6.2822 | **62822x** | 0.3093 | `00860001011039, 00860001011171, 00860001011172` |
| `01415__NINGUNO` | 2398 | 0.0001 | 1.7628 | **17628x** | 0.0957 | `01415001010003, 01415001010022, 01415001010025` |
| `01191__NINGUNO` | 98 | 0.0001 | 0.8463 | **8463x** | 0.0093 | `01191001010006, 01191001010007, 01191001010010` |
| `00664__GENERAL` | 62 | 0.0001 | 0.7484 | **7484x** | 0.1318 | `00664001010003, 00664001010007, 00664001010008` |
| `00891__NINGUNO` | 62 | 0.0005 | 2.3762 | **4752x** | 0.0816 | `00891001010037, 00891001010050, 00891001010070` |
| `00023__NINGUNO` | 367 | 0.0002 | 0.8832 | **4416x** | 0.0779 | `00023001010195, 00023001010197, 00023001010322` |
| `00784__NINGUNO` | 826 | 0.0018 | 4.4502 | **2472x** | 0.1999 | `00784001010095, 00784001010096, 00784001010097` |
| `00983__NINGUNO` | 209 | 0.0008 | 0.8832 | **1104x** | 0.1000 | `00983001010305, 00983001010333, 00983001010364` |
| `01347__NINGUNO` | 144 | 0.0025 | 2.2657 | **906x** | 0.2163 | `01347001010000, 01347001010001, 01347001010002` |
| `01172__NINGUNO` | 605 | 0.0002 | 0.1648 | **824x** | 0.0011 | `01172001010014, 01172001010015, 01172001010018` |
| `01001__NINGUNO` | 204 | 0.0028 | 1.8917 | **676x** | 0.1089 | `01001001010135, 01001001010395, 01001001010738` |
| `01428__NINGUNO` | 17 | 0.0006 | 0.3800 | **633x** | 0.1367 | `01428001010003, 01428001010004, 01428001010033` |
| `04376__NINGUNO` | 379 | 0.0069 | 4.1732 | **605x** | 0.1450 | `04376001010001, 04376001010002, 04376001010005` |
| `04366__NINGUNO` | 47 | 0.0014 | 0.6220 | **444x** | 0.1840 | `04366001010001, 04366001010010, 04366001010013` |
| `00588__NINGUNO` | 93 | 0.0100 | 4.2268 | **423x** | 0.4416 | `00588001010002, 00588001010005, 00588001010008` |
| `01199__NINGUNO` | 79 | 0.0014 | 0.5715 | **408x** | 0.0477 | `01199001010002, 01199001010029, 01199001010042` |
| `00362__BOGAL` | 928 | 0.0100 | 3.3132 | **331x** | 0.1767 | `00362019010012, 00362019010013, 00362019010014` |
| `00952__NINGUNO` | 44 | 0.0019 | 0.5821 | **306x** | 0.0967 | `00952001011023, 00952001011159, 00952001011361` |
| `00894__NINGUNO` | 153 | 0.0026 | 0.7677 | **295x** | 0.2306 | `00894001010045, 00894001010071, 00894001010073` |
| `01361__NINGUNO` | 184 | 0.0065 | 1.7000 | **262x** | 0.2520 | `01361001010002, 01361001010003, 01361001010004` |
| `04926__NINGUNO` | 13 | 0.0044 | 1.0577 | **240x** | 0.0816 | `04926001000000, 04926001000001, 04926001000002` |
| `00499__NINGUNO` | 271 | 0.0012 | 0.2800 | **233x** | 0.0816 | `00499001010001, 00499001010005, 00499001010006` |
| `04887__NINGUNO` | 40 | 0.0144 | 2.9727 | **206x** | 0.0700 | `04887001010003, 04887001010009, 04887001010013` |
| `00890__NINGUNO` | 36 | 0.0008 | 0.1705 | **204x** | 0.0389 | `00890001010001, 00890001010007, 00890001010010` |
| `01027__NINGUNO` | 171 | 0.0100 | 2.0400 | **204x** | 0.6469 | `01027001010011, 01027001010012, 01027001010013` |
| `04596__157` | 46 | 0.0100 | 1.9403 | **194x** | 0.3895 | `04596000000000, 04596000000005, 04596000000006` |
| `01430__NINGUNO` | 10 | 0.0006 | 0.1158 | **193x** | 0.0303 | `01430001010004, 01430001010012, 01430001010018` |
| `00645__KIDS` | 21 | 0.0036 | 0.6469 | **180x** | 0.2996 | `00645007010000, 00645007010001, 00645007010002` |
| `04355__NINGUNO` | 42 | 0.0054 | 0.9150 | **169x** | 0.2038 | `04355001010005, 04355001010008, 04355001010018` |
| `00362__JORDAN EVO` | 23 | 0.0194 | 2.8325 | **146x** | 0.0837 | `00362026010002, 00362026010060, 00362026010247` |

---
## AUDIT 3 — Validación Cruzada con Dimensiones de Stage4

Para productos con ancho, alto, profundidad en stage4 (profundidad ≥5cm, alto ≥5cm).
vol_calc = ancho × alto × profundidad / 1,000,000 (cm³ → m³)

Productos validables: 9,672
Productos flagados (ratio fuera de [0.1, 8]): **699**

### Top 50 con mayor discrepancia absoluta |vol_logistico - vol_producto_calc|

| COD | Descripción | Vol Log | Vol Calc | Ratio | Discrepancia | Capa |
|-----|-------------|---------|----------|-------|--------------|------|
| `00860001015704` | PERGOLA HIERRO 350X350X350 HECHO A  | 0.0430 | 42.8750 | 0.00x ⚠ | 42.8320 | 1 |
| `00860001014247` | PERGOLA HIERRO 304X304X332 CENADOR  | 1.5326 | 30.6821 | 0.05x ⚠ | 29.1495 | 3 |
| `00860001014248` | PERGOLA HIERRO 304X304X332 CENADOR  | 1.5326 | 30.6821 | 0.05x ⚠ | 29.1495 | 3 |
| `00860001011876` | PARASOL POLIESTER 300X300X250 180 G | 1.1239 | 22.5000 | 0.05x ⚠ | 21.3761 | 3 |
| `00860001011877` | PARASOL POLIESTER 300X300X250 180 G | 1.1239 | 22.5000 | 0.05x ⚠ | 21.3761 | 3 |
| `00860001011878` | PARASOL POLIESTER 300X300X250 180 G | 1.1239 | 22.5000 | 0.05x ⚠ | 21.3761 | 3 |
| `00860001014275` | PARASOL ACERO PE 250X250X245 SINTET | 0.7649 | 15.3125 | 0.05x ⚠ | 14.5476 | 3 |
| `04411001010041` | BLENDER BRAUN MBR06B | 0.0078 | 6.1200 | 0.00x ⚠ | 6.1122 | 2 |
| `00860001014217` | CAMA CHILL OUT ALUMINIO 148X188X205 | 0.2849 | 5.7039 | 0.05x ⚠ | 5.4190 | 3 |
| `00860001015756` | BANCO ACERO 215X120X180 COLUMPIO 3  | 4.6394 | 0.0046 | 999.01x ⚠ | 4.6348 | 3 |
| `00860001015030` | CAMA MANGO RATAN 167X212X120 29,33  | 0.2280 | 4.2485 | 0.05x ⚠ | 4.0205 | 1 |
| `01319001010068` | CHAISELONGUE 300CM. IZQUIERDA VELLA | 2.5400 | 5.9850 | 0.42x | 3.4450 | 1 |
| `01319001010069` | CHAISELONGUE 300CM. DERECHA VELLA T | 2.5400 | 5.9850 | 0.42x | 3.4450 | 1 |
| `04915001010031` | ARMARIO 2P CORREDERAS 269.9X209.7X6 | 0.2570 | 3.4625 | 0.07x ⚠ | 3.2055 | 1 |
| `04915001010032` | ARMARIO 2P CORREDERAS 269.9X209.7X6 | 0.2570 | 3.4625 | 0.07x ⚠ | 3.2055 | 1 |
| `00860001015029` | CAMA ACACIA 165X205X100 CABECERO NA | 0.2020 | 3.3825 | 0.06x ⚠ | 3.1805 | 1 |
| `00860001014744` | ARBOL LED METAL 120X120X220 400L PL | 0.0380 | 3.1680 | 0.01x ⚠ | 3.1300 | 1 |
| `00860001014741` | ARBOL LED PE 125X125X210 450L 1259  | 0.1600 | 3.2812 | 0.05x ⚠ | 3.1212 | 1 |
| `00784001012766` | CAMA BEIGE TEJIDO DORMITORIO 613529 | 0.2610 | 3.2592 | 0.08x ⚠ | 2.9982 | 1 |
| `00010010012150` | COMPOSICION 300 CM N  11 NORDIC+BLA | 3.0000 | 0.2362 | 12.70x ⚠ | 2.7637 | 1 |
| `04376001010353` | CAMA TREN MOD.DONALD ANDERSEN-GRAFI | 1.5200 | 4.1774 | 0.36x | 2.6574 | 1 |
| `04915001010056` | ARMARIO 2P BLANCO MATE 200.1X235X61 | 0.2570 | 2.8778 | 0.09x ⚠ | 2.6208 | 1 |
| `04915001010057` | ARMARIO 2P BLANCO MATE ESPEJO 200.1 | 0.2570 | 2.8778 | 0.09x ⚠ | 2.6208 | 1 |
| `00362026010248` | ARMARIO 4 ÙERTAS  239X199,2 JORDAN  | 0.1960 | 2.5709 | 0.08x ⚠ | 2.3749 | 1 |
| `04915001010029` | ARMARIO 2P CORREDERAS 200.1X209.7X6 | 0.2570 | 2.5680 | 0.10x | 2.3110 | 1 |
| `04915001010030` | ARMARIO 2P CORREDERAS 200.1X209.7X6 | 0.2570 | 2.5680 | 0.10x | 2.3110 | 1 |
| `00860001014740` | ARBOL LED PE 115X115X180 300L 807 R | 0.1230 | 2.3805 | 0.05x ⚠ | 2.2575 | 1 |
| `00860001015031` | CAMA TECA 180X200X75 PARA COLCHON 1 | 0.4850 | 2.7000 | 0.18x | 2.2150 | 1 |
| `04915001010014` | ARMARIO 2P 3C 200*201CM BLANCO  W2Q | 0.2570 | 2.4553 | 0.10x | 2.1983 | 1 |
| `04915001010048` | ARMARIO 4PUERTAS 4CAJON  205.9X200. | 0.2570 | 2.4226 | 0.11x | 2.1656 | 1 |
| `04915001010049` | ARMARIO 4PUERTAS 4CAJON  205.9X200. | 0.2570 | 2.4226 | 0.11x | 2.1656 | 1 |
| `04915001010016` | ARMARIO CON ESTANTES 4P 4C 206*200C | 0.2840 | 2.4214 | 0.12x | 2.1374 | 1 |
| `04376001010834` | ARMARIO 4 PUERTAS 2 CAJONES RAPID M | 0.1450 | 2.1444 | 0.07x ⚠ | 1.9994 | 1 |
| `00588001010308` | SOFA CAMA CLIC-CLAC DAX TELA MALMO  | 3.0000 | 1.0395 | 2.89x | 1.9605 | 1 |
| `04915001010027` | ARMARIO 2P CORREDERAS 170.3X209.7X6 | 0.2570 | 2.1856 | 0.12x | 1.9286 | 1 |
| `04915001010028` | ARMARIO 2P CORREDERAS 170.3X209.7X6 | 0.2570 | 2.1856 | 0.12x | 1.9286 | 1 |
| `04915001010054` | ARMARIO  2P BLANCO MATE 150.1X235X6 | 0.2570 | 2.1587 | 0.12x | 1.9017 | 1 |
| `04915001010055` | ARMARIO  2P BLANCO MATE  ESPEJO 150 | 0.2570 | 2.1587 | 0.12x | 1.9017 | 1 |
| `04915001010019` | ARMARIO 2P 3C 170*201CM BLANCO  W2Q | 0.2570 | 2.0897 | 0.12x | 1.8327 | 1 |
| `04915001010043` | ARMARIO 4 PUERTAS 1 CAJON  177.5X21 | 0.2570 | 2.0251 | 0.13x | 1.7681 | 1 |
| `04915001010044` | ARMARIO 4 PUERTAS 1 CAJON  177.5X21 | 0.2570 | 2.0251 | 0.13x | 1.7681 | 1 |
| `04915001010045` | ARMARIO 2PUERTAS 2PUERTAS ESPEJO 1C | 0.2570 | 2.0251 | 0.13x | 1.7681 | 1 |
| `04915001010015` | ARMARIO CON ESPEJO 2P 2PE 1C 178*21 | 0.2670 | 2.0251 | 0.13x | 1.7581 | 1 |
| `04376001010042` | ARMARIO 2 PUERTAS CORREDERAS 207,6X | 0.3000 | 2.0552 | 0.15x | 1.7552 | 1 |
| `01361001010608` | AIRE ACONDICIONADO CHS SPLIT INVERT | 1.7000 | 0.0896 | 18.97x ⚠ | 1.6104 | 1 |
| `00362019010299` | SILLA ATLANTA 68 MOSTAZA BOGAL CG15 | 1.8300 | 0.2344 | 7.81x | 1.5956 | 1 |
| `01319001010047` | CHAISELONGUE IZQUIERDA AVRIL TELA V | 2.3200 | 0.7448 | 3.11x | 1.5752 | 1 |
| `01319001010048` | CHAISELONGUE DERECHA AVRIL TELA VOL | 2.3200 | 0.7448 | 3.11x | 1.5752 | 1 |
| `01319001010049` | CHAISELONGUE IZQUIERDA AVRIL TELA V | 2.3200 | 0.7448 | 3.11x | 1.5752 | 1 |
| `01319001010050` | CHAISELONGUE DERECHA AVRIL TELA VOL | 2.3200 | 0.7448 | 3.11x | 1.5752 | 1 |

---
## AUDIT 4 — Valores Repetidos Sospechosos

Agrupación por vol_logistico redondeado a 4 decimales. Top 20 valores más frecuentes.

| Vol (m³) | Count | Categorías distintas | Disparate? | Ejemplos COD |
|----------|-------|----------------------|------------|--------------|
| 0.0816 | 551 | 4 (HORNO_PLACA, MENAJE, OTRO, PEQ_ELECTRO) | **SI** | `00012001010007, 00012001010008, 00012001010009` |
| 0.2306 | 362 | 6 (ALFOMBRA, CAMA, COLCHON, OTRO, SILLA, TEXTIL) | **SI** | `00081001011153, 00081001011155, 00081001011156` |
| 0.6469 | 357 | 4 (CAMA, COLCHON, CUADRO, OTRO) | **SI** | `00645006010035, 00645006010039, 00645006010042` |
| 0.3672 | 226 | 6 (APARADOR, COMODA, MESA_CENTRO, MESA_COMEDOR, OTRO, VITRINA) | **SI** | `00664001010037, 00664001010039, 00664001010044` |
| 0.8832 | 224 | 6 (CAMA, OTRO, SILLA, SOFA_CAMA, SOFA_GRANDE, TEXTIL) | **SI** | `00023001011335, 00023001011618, 00023001011858` |
| 0.1648 | 186 | 5 (AUDIO, OTRO, RECIBIDOR, SILLA, TV) | **SI** | `00185006010118, 00185006010120, 01172001010482` |
| 0.3848 | 184 | 9 (ARMARIO, CABECERO, CAMA, COLCHON, COMODA, LIBRERIA, MESITA, ) | **SI** | `00362021010220, 00362023010000, 00362023010502` |
| 0.1089 | 181 | 17 (ALFOMBRA, APARADOR, CALEFACCION, COMODA, CUADRO, DECORACION,) | **SI** | `00023001010471, 00023001010549, 00023001010890` |
| 0.0011 | 175 | 5 (AUDIO, DECORACION, MOVIL, OTRO, TV) | **SI** | `00748001010075, 00860001012611, 00860001012620` |
| 0.1199 | 160 | 9 (ALFOMBRA, CABECERO, CUADRO, DECORACION, ESPEJO, MENAJE, OTRO) | **SI** | `00023001011454, 00023001011609, 00023001013127` |
| 0.7099 | 145 | 9 (ARMARIO, CABECERO, COMODA, COMPOSICION, LIBRERIA, LITERA, ME) | **SI** | `00023001010786, 00362000000011, 00362000000029` |
| 0.0957 | 144 | 5 (CABECERO, CALEFACCION, CLIMA, FRIGO, OTRO) | **SI** | `00189001010032, 00871001010010, 00930001010019` |
| 0.2786 | 136 | 10 (APARADOR, COMPOSICION, ESPEJO, LIBRERIA, MESA_CENTRO, MESA_C) | **SI** | `00023001012491, 00023001012883, 00362019010843` |
| 0.1318 | 133 | 6 (ARMARIO, COMODA, LIBRERIA, MESA_CENTRO, MESITA, OTRO) | **SI** | `00664001010007, 00664001010018, 00664001010028` |
| 0.0004 | 82 | 4 (AUDIO, DECORACION, MOVIL, OTRO) | **SI** | `00860001012599, 00860001012601, 01172001010014` |
| 0.2000 | 69 | 13 (CABECERO, COMODA, COMPOSICION, CUADRO, MESA_CENTRO, MESA_ESC) | **SI** | `00300001010735, 00362019010361, 00362019010397` |
| 0.0411 | 68 | 8 (ASPIRADOR, MENAJE, MICROONDAS, OTRO, PEQ_ELECTRO, SOFA_GRAND) | **SI** | `00023001010599, 00163001010098, 00983001011564` |
| 0.0800 | 60 | 14 (ALFOMBRA, ARMARIO, ASPIRADOR, CALEFACCION, CLIMA, COLCHON, M) | **SI** | `00023001011721, 00023001012338, 00023001012861` |
| 0.0026 | 54 | 3 (ESPEJO, OTRO, PEQ_ELECTRO) | No | `00748001010047, 00860001012616, 00860001013651` |
| 0.0001 | 49 | 7 (ALFOMBRA, AUDIO, CABECERO, CUADRO, ESPEJO, MOVIL, OTRO) | **SI** | `00664001010049, 00664001010159, 00664001010175` |

### Valores con >100 productos de categorías muy dispares (flag severo)

- **0.0816 m³**: 551 productos, categorías: HORNO_PLACA, MENAJE, OTRO, PEQ_ELECTRO
- **0.2306 m³**: 362 productos, categorías: ALFOMBRA, CAMA, COLCHON, OTRO, SILLA, TEXTIL
- **0.6469 m³**: 357 productos, categorías: CAMA, COLCHON, CUADRO, OTRO
- **0.3672 m³**: 226 productos, categorías: APARADOR, COMODA, MESA_CENTRO, MESA_COMEDOR, OTRO, VITRINA
- **0.8832 m³**: 224 productos, categorías: CAMA, OTRO, SILLA, SOFA_CAMA, SOFA_GRANDE, TEXTIL
- **0.1648 m³**: 186 productos, categorías: AUDIO, OTRO, RECIBIDOR, SILLA, TV
- **0.3848 m³**: 184 productos, categorías: ARMARIO, CABECERO, CAMA, COLCHON, COMODA, LIBRERIA, MESITA, OTRO, SILLA
- **0.1089 m³**: 181 productos, categorías: ALFOMBRA, APARADOR, CALEFACCION, COMODA, CUADRO, DECORACION, ESPEJO, LAMPARA, LIBRERIA, MESA_CENTRO, MESA_COMEDOR, MESA_ESCRITORIO, MESITA, OTRO, RECIBIDOR, SILLA, VITRINA
- **0.0011 m³**: 175 productos, categorías: AUDIO, DECORACION, MOVIL, OTRO, TV
- **0.1199 m³**: 160 productos, categorías: ALFOMBRA, CABECERO, CUADRO, DECORACION, ESPEJO, MENAJE, OTRO, RECIBIDOR, SILLA
- **0.7099 m³**: 145 productos, categorías: ARMARIO, CABECERO, COMODA, COMPOSICION, LIBRERIA, LITERA, MESA_ESCRITORIO, MESITA, OTRO
- **0.0957 m³**: 144 productos, categorías: CABECERO, CALEFACCION, CLIMA, FRIGO, OTRO
- **0.2786 m³**: 136 productos, categorías: APARADOR, COMPOSICION, ESPEJO, LIBRERIA, MESA_CENTRO, MESA_COMEDOR, MUEBLE_TV, OTRO, SILLA, VITRINA
- **0.1318 m³**: 133 productos, categorías: ARMARIO, COMODA, LIBRERIA, MESA_CENTRO, MESITA, OTRO

---
## AUDIT 5 — Análisis por Supplier

Agrupado por primeros 5 dígitos de COD_ARTICULO. Score = (pct_tiny×3) + (pct_gigante×2) + log10(max/min si >100).

### Top 20 suppliers más sospechosos

| Supplier | N | Vol Min | Vol Max | Ratio | Mediana | % Tiny | % Giant | % Capa1 | % Capa4 | Score |
|----------|---|---------|---------|-------|---------|--------|---------|---------|---------|-------|
| `00748` | 13 | 0.0002 | 0.0043 | 22x | 0.0007 | 100% | 0% | 0% | 0% | **300.0** |
| `00874` | 4 | 0.0021 | 0.0025 | 1x | 0.0023 | 100% | 0% | 0% | 0% | **300.0** |
| `01249` | 3 | 0.0015 | 0.0027 | 2x | 0.0018 | 100% | 0% | 0% | 0% | **300.0** |
| `01449` | 3 | 0.0013 | 0.0019 | 1x | 0.0017 | 100% | 0% | 0% | 0% | **300.0** |
| `04464` | 3 | 0.0011 | 0.0037 | 3x | 0.0028 | 100% | 0% | 0% | 0% | **300.0** |
| `01454` | 5 | 0.0012 | 0.0078 | 6x | 0.0022 | 80% | 0% | 0% | 0% | **240.0** |
| `01431` | 7 | 0.0009 | 0.0974 | 108x | 0.0011 | 71% | 0% | 0% | 0% | **216.3** |
| `01172` | 605 | 0.0002 | 0.1648 | 824x | 0.0011 | 67% | 0% | 0% | 49% | **205.2** |
| `01408` | 40 | 0.0042 | 0.2176 | 52x | 0.0049 | 62% | 0% | 10% | 5% | **187.5** |
| `01388` | 18 | 0.0030 | 0.0185 | 6x | 0.0057 | 50% | 0% | 0% | 0% | **150.0** |
| `00994` | 39 | 0.0006 | 0.0816 | 136x | 0.0058 | 49% | 0% | 0% | 46% | **148.3** |
| `01191` | 98 | 0.0001 | 0.8463 | 8463x | 0.0093 | 41% | 0% | 4% | 4% | **126.4** |
| `01112` | 5 | 0.0029 | 0.0540 | 19x | 0.0446 | 40% | 0% | 0% | 0% | **120.0** |
| `01392` | 3 | 0.0033 | 0.0816 | 25x | 0.0249 | 33% | 0% | 0% | 33% | **100.0** |
| `00894` | 153 | 0.0026 | 0.7677 | 295x | 0.2306 | 27% | 0% | 0% | 61% | **84.8** |
| `00891` | 62 | 0.0005 | 2.3762 | 4752x | 0.0816 | 23% | 0% | 0% | 58% | **71.4** |
| `01127` | 8 | 0.8832 | 5.0187 | 6x | 0.8832 | 0% | 25% | 0% | 75% | **50.0** |
| `00664` | 86 | 0.0001 | 0.7913 | 7913x | 0.1901 | 13% | 0% | 21% | 36% | **42.3** |
| `00983` | 209 | 0.0008 | 0.8832 | 1104x | 0.1000 | 13% | 0% | 2% | 31% | **41.8** |
| `01140` | 47 | 0.0013 | 0.1199 | 92x | 0.1199 | 13% | 0% | 0% | 64% | **38.3** |

---
## AUDIT 6 — Rangos Esperados por Categoría

Productos cuyo vol_logistico está fuera del rango físico esperado para su categoría.

### Resumen de violaciones por categoría

| Categoría | Rango esperado | Violaciones LOW | Violaciones HIGH | Total |
|-----------|----------------|-----------------|------------------|-------|
| ARMARIO | [0.4, 6.0] | 188 | 0 | **188** |
| ASPIRADOR | [0.02, 0.2] | 2 | 1 | **3** |
| CALEFACCION | [0.005, 0.15] | 3 | 9 | **12** |
| CAMA | [0.2, 4.0] | 20 | 3 | **23** |
| CAMPANA | [0.06, 0.3] | 23 | 23 | **46** |
| COLCHON | [0.08, 0.9] | 5 | 50 | **55** |
| COMODA | [0.1, 1.0] | 23 | 0 | **23** |
| ESPEJO | [0.005, 0.3] | 33 | 4 | **37** |
| FRIGO | [0.35, 1.8] | 86 | 0 | **86** |
| LAVADORA | [0.25, 0.65] | 18 | 6 | **24** |
| LAVAVAJILLAS | [0.25, 0.55] | 12 | 0 | **12** |
| LIBRERIA | [0.1, 2.0] | 53 | 0 | **53** |
| LITERA | [0.6, 4.0] | 3 | 1 | **4** |
| MESITA | [0.03, 0.3] | 34 | 64 | **98** |
| MICROONDAS | [0.03, 0.18] | 8 | 5 | **13** |
| PEQ_ELECTRO | [0.001, 0.08] | 1 | 46 | **47** |
| SOFA_CAMA | [0.5, 3.0] | 23 | 4 | **27** |
| SOFA_GRANDE | [0.3, 4.0] | 19 | 18 | **37** |
| TV | [0.03, 0.8] | 9 | 13 | **22** |
| VITRINA | [0.2, 2.0] | 9 | 0 | **9** |

### Top 60 violaciones por impacto

| COD | Descripción | Categoría | Vol Actual | Rango | Lado | Impacto | Capa |
|-----|-------------|-----------|------------|-------|------|---------|------|
| `00860001015246` | SOFA CAMA POLIESTER 285X260X90 BEIG | SOFA_CAMA | 6.2822 | [0.5, 3.0] | HIGH | 3.2822 | 3 |
| `00860001015247` | SOFA CAMA POLIESTER 307X242X86 CHAI | SOFA_CAMA | 6.0187 | [0.5, 3.0] | HIGH | 3.0187 | 3 |
| `00860001015228` | CAMA POLIESTER METAL 196X223X135 18 | CAMA | 5.9006 | [0.2, 4.0] | HIGH | 1.9006 | 3 |
| `00860001015220` | SOFA POLIESTER MADERA 235X303X86 GR | SOFA_GRANDE | 5.7684 | [0.3, 4.0] | HIGH | 1.7684 | 3 |
| `00860001013454` | CAMA MADERA METAL 187X210X137 CAPIT | CAMA | 5.3800 | [0.2, 4.0] | HIGH | 1.3800 | 3 |
| `00860001013455` | CAMA MADERA METAL 200X220X120 CAPIT | CAMA | 5.2800 | [0.2, 4.0] | HIGH | 1.2800 | 3 |
| `01027001011242` | COLCHON 150X190 WIND | COLCHON | 2.0400 | [0.08, 0.9] | HIGH | 1.1400 | 1 |
| `01127001000217` | RINCONERA DER.L295X215X84/106 CM, 3 | SOFA_GRANDE | 5.0187 | [0.3, 4.0] | HIGH | 1.0187 | 3 |
| `01127001000218` | RINCONERA IZQ.L295X215X84/106 CM, 3 | SOFA_GRANDE | 5.0187 | [0.3, 4.0] | HIGH | 1.0187 | 3 |
| `00860001015278` | SOFA CAMA POLIESTER 298X154X92 AREN | SOFA_CAMA | 3.9772 | [0.5, 3.0] | HIGH | 0.9772 | 3 |
| `00860001015310` | SOFA CAMA POLIESTER 298X154X92 GRIS | SOFA_CAMA | 3.9772 | [0.5, 3.0] | HIGH | 0.9772 | 3 |
| `00159001010309` | SET RINCONERA ALUMINIO ANTRACITA CO | SOFA_GRANDE | 4.8336 | [0.3, 4.0] | HIGH | 0.8336 | 3 |
| `00159001010310` | SET RINCONERA ALUMINIO BLANCO COJIN | SOFA_GRANDE | 4.8336 | [0.3, 4.0] | HIGH | 0.8336 | 3 |
| `01137001010548` | COMPOSICION CHAISELONGE IZDA(290)CM | SOFA_GRANDE | 4.7806 | [0.3, 4.0] | HIGH | 0.7806 | 3 |
| `01137001010549` | COMPOSICION CHAISELONGE DCHA(290)CM | SOFA_GRANDE | 4.7806 | [0.3, 4.0] | HIGH | 0.7806 | 3 |
| `01415001013061` | TELEVISOR HISENSE 100" QLED  100E7N | TV | 1.4773 | [0.03, 0.8] | HIGH | 0.6773 | 3 |
| `00860001014293` | CAMA CHILL OUT RATAN 153X153X65 COL | COLCHON | 1.5201 | [0.08, 0.9] | HIGH | 0.6201 | 3 |
| `01415001015972` | TELEVISOR HISENSE 100" QLED 100E7Q  | TV | 1.4091 | [0.03, 0.8] | HIGH | 0.6091 | 3 |
| `01274002010051` | MESITA NOCHE 48,5X36X52 GABAR 6411 | MESITA | 0.9000 | [0.03, 0.3] | HIGH | 0.6000 | 1 |
| `00664001010143` | BICAMA ESTEBAN 200/190X90 VERDE KAK | LITERA | 0.0010 | [0.6, 4.0] | LOW | 0.5990 | 1 |
| `00664001010051` | LITERA 0.90 KIARA BLANCO/CERA BLANC | LITERA | 0.0030 | [0.6, 4.0] | LOW | 0.5970 | 1 |
| `03897006000213` | WALLY COMPO 292CM CHAISE LONGUE BRA | SOFA_GRANDE | 4.5880 | [0.3, 4.0] | HIGH | 0.5880 | 1 |
| `03897006000214` | WALLY COMPO 292CM CHAISE LONGUE BRA | SOFA_GRANDE | 4.5880 | [0.3, 4.0] | HIGH | 0.5880 | 1 |
| `01415001015971` | TELEVISOR HISENSE 98" QLED SMART TV | TV | 1.3513 | [0.03, 0.8] | HIGH | 0.5513 | 3 |
| `04997001010059` | CHAISELONGUE DCHA. KATI SERIE 1 | SOFA_GRANDE | 4.5387 | [0.3, 4.0] | HIGH | 0.5387 | 3 |
| `04997001010060` | CHAISELONGUE IZDA. KATI SERIE 1 | SOFA_GRANDE | 4.5387 | [0.3, 4.0] | HIGH | 0.5387 | 3 |
| `00790001010190` | COLCHON 200X200 MONTBLANC NOVA | COLCHON | 1.4014 | [0.08, 0.9] | HIGH | 0.5014 | 3 |
| `00860001013608` | ESPEJO HIERRO CRISTAL 90X1X150 VENT | ESPEJO | 0.7700 | [0.005, 0.3] | HIGH | 0.4700 | 1 |
| `00784001012370` | SOFA CHAISE LONGUE DERECHA 266 X 22 | SOFA_GRANDE | 4.4502 | [0.3, 4.0] | HIGH | 0.4502 | 3 |
| `00664001010129` | MESITA BERNA 2C BLANCO BERNA I-4562 | MESITA | 0.7484 | [0.03, 0.3] | HIGH | 0.4484 | 4 |
| `00664001010130` | MESITA BRUNA 1P CERA/CERA BRUNA 131 | MESITA | 0.7484 | [0.03, 0.3] | HIGH | 0.4484 | 4 |
| `00664001010131` | MESITA BRUNA 1P CERA/GRIS ANT BRUNA | MESITA | 0.7484 | [0.03, 0.3] | HIGH | 0.4484 | 4 |
| `00664001010133` | MESITA CUSCO 2C CERA/GRIS T-BLANCO  | MESITA | 0.7484 | [0.03, 0.3] | HIGH | 0.4484 | 4 |
| `00664001010140` | MESITA MAX 2C BLANCO MAX 16103 | MESITA | 0.7484 | [0.03, 0.3] | HIGH | 0.4484 | 4 |
| `00664001010141` | MESITA MAX 2C VERDE PETROLEO MAX 16 | MESITA | 0.7484 | [0.03, 0.3] | HIGH | 0.4484 | 4 |
| `01347001010033` | LOW COST MESITA 2C ROBLE LC7820R (E | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `02441003004322` | MESITA HOME BOX MESITA 2  CAJONES C | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `02441003004323` | MESITA DEN 3 CAJONES C/RUEDAS L40XP | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `02441003004324` | MESITA SMART  2 CAJONES C/RUEDAS L4 | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `02441003004325` | MESITA ADAPT 2 CAJONES Y BANDEJA C/ | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `02441003004326` | MESITA ADAPT 3 CAJONES Y BANDEJA C/ | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `02441003004327` | MESITA DEN 2 CAJONES C/PATAS  L40XP | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008640` | MESITA CHROMA T30 1 CAJON + 1 CAJON | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008641` | MESITA CHROMA T30 1 CAJON + 1 CAJON | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008642` | MESITA CHROMA T30 3 CAJONES L40XP42 | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008643` | MESITA CHROMA T30 3 CAJONES L50XP42 | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008644` | MESITA CHROMA T30 1 CAJON + 1 HUECO | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008645` | MESITA CHROMA T30 2 CAJONES C/RUEDA | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008646` | MESITA CHROMA T10 1 CAJON + 1 HUECO | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `03898001008647` | MESITA CHROMA T10 2 CAJONES C/PATAS | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `04057002007135` | MESITA RECTA 3 CAJONES CON RUEDAS L | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `04057002007136` | MESITA SPACE 2 CAJONES CON RUEDAS L | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `04057002007137` | MESITA SPACE 3 CAJONES CON RUEDAS L | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `04057002007148` | MESITA RECTA 2 CAJONES CON RUEDAS L | MESITA | 0.7099 | [0.03, 0.3] | HIGH | 0.4099 | 4 |
| `01415001010850` | MESA TAURUS PLANCHA 994178 ARGENTA  | PEQ_ELECTRO | 0.4861 | [0.001, 0.08] | HIGH | 0.4061 | 3 |
| `00045001010023` | CENTRO PLANCHADO K-S ROLSER K04015 | PEQ_ELECTRO | 0.4811 | [0.001, 0.08] | HIGH | 0.4011 | 3 |
| `01415001012406` | MESA JATA-H PLANCHA COMPACT 124X40  | PEQ_ELECTRO | 0.4705 | [0.001, 0.08] | HIGH | 0.3905 | 3 |
| `00362026010265` | COMPOSICION Nº 28 ROBLE/LINED ROBLE | ARMARIO | 0.0194 | [0.4, 6.0] | LOW | 0.3806 | 3 |
| `01415001012402` | MESA ORBEGOZO PLANCHA 117X40 SOPORT | PEQ_ELECTRO | 0.4439 | [0.001, 0.08] | HIGH | 0.3639 | 3 |
| `00790001010123` | COLCHON 180X200 MONTBLANC NOVA | COLCHON | 1.2613 | [0.08, 0.9] | HIGH | 0.3613 | 3 |

---
## AUDIT 7 — Gemini la Cagó

Para productos con estimation_layer='gemini_embalaje'.
Sospechoso si: ratio vol_logistico/vol_producto < 1.2 OR desviado >4x de la mediana de su categoría.

Productos Gemini analizados: 2,237
Productos sospechosos: **996**

### Top 30 más sospechosos

| COD | Descripción | Vol Log | Vol Prod | Ratio Emb/Prod | Mediana Cat | Score | Razón |
|-----|-------------|---------|----------|----------------|-------------|-------|-------|
| `01199001010401` | CUT-X 4500 TEXTILE 5748 CECOTE | 0.0014 | 0.0759 | 0.02 | 0.1199 | 19.27 | ratio_pkg/prod=0.02 (embalaje=producto, deberia ser >1.2); r |
| `01430001010043` | PATINETE ELECTRICO XIAOMI SCOO | 0.1122 | 0.5402 | 0.21 | 0.0006 | 18.15 | ratio_pkg/prod=0.21 (embalaje=producto, deberia ser >1.2); r |
| `01415001010610` | PLANCHA UFESA PELO X-TREME INF | 0.0018 | 0.0909 | 0.02 | 0.0353 | 17.78 | ratio_pkg/prod=0.02 (embalaje=producto, deberia ser >1.2); r |
| `04411001010041` | BLENDER BRAUN MBR06B | 0.0078 | 6.1200 | 0.00 | 0.0353 | 16.50 | ratio_pkg/prod=0.00 (embalaje=producto, deberia ser >1.2); r |
| `01415001010602` | VENTILADOR BASTILIPO BERMEO BL | 0.0174 | 0.4966 | 0.04 | 0.0957 | 16.35 | ratio_pkg/prod=0.04 (embalaje=producto, deberia ser >1.2); r |
| `01415001014492` | VENTILADOR BASTILIPO TECHO (CA | 0.0201 | 0.7290 | 0.03 | 0.0957 | 16.28 | ratio_pkg/prod=0.03 (embalaje=producto, deberia ser >1.2); r |
| `01415001014500` | VENTILADOR BASTILIPO BERMEO NI | 0.0210 | 0.4410 | 0.05 | 0.0957 | 16.04 | ratio_pkg/prod=0.05 (embalaje=producto, deberia ser >1.2); r |
| `01415001014501` | VENTILADOR BASTILIPO CANCUN BL | 0.0222 | 0.5072 | 0.04 | 0.0957 | 16.02 | ratio_pkg/prod=0.04 (embalaje=producto, deberia ser >1.2); r |
| `01392001010003` | LAMPARA ESCRITORIO CARGADOR IN | 0.0033 | 0.0086 | 0.38 | 0.3710 | 15.89 | ratio_pkg/prod=0.38 (embalaje=producto, deberia ser >1.2); r |
| `00098001000030` | PLANCHA ROWENTA 2400W VAPOR EF | 0.0074 | 0.1023 | 0.07 | 0.0353 | 15.84 | ratio_pkg/prod=0.07 (embalaje=producto, deberia ser >1.2); r |
| `01415001014502` | VENTILADOR BASTILIPO BALI NIQU | 0.0256 | 0.4809 | 0.05 | 0.0957 | 15.79 | ratio_pkg/prod=0.05 (embalaje=producto, deberia ser >1.2) |
| `01415001014499` | VENTILADOR BASTILIPO AGUADULCE | 0.0225 | 0.2677 | 0.08 | 0.0957 | 15.61 | ratio_pkg/prod=0.08 (embalaje=producto, deberia ser >1.2); r |
| `00229001010029` | VENTILADOR DE PIE DE 40 CMS OR | 0.0290 | 0.4500 | 0.06 | 0.0957 | 15.55 | ratio_pkg/prod=0.06 (embalaje=producto, deberia ser >1.2) |
| `01415001014495` | VENTILADOR BASTILIPO MALIBÚ NI | 0.0374 | 0.8189 | 0.05 | 0.0957 | 15.48 | ratio_pkg/prod=0.05 (embalaje=producto, deberia ser >1.2) |
| `01428001010065` | TELEVISOR SONY 32" (81,28 CM)  | 0.0587 | 0.6212 | 0.09 | 0.2038 | 15.30 | ratio_pkg/prod=0.09 (embalaje=producto, deberia ser >1.2) |
| `01415001014157` | VENTILADOR HTW DE PIE CON MOTO | 0.0246 | 0.1968 | 0.12 | 0.0957 | 15.11 | ratio_pkg/prod=0.12 (embalaje=producto, deberia ser >1.2) |
| `01431001010066` | TELEFONO MOVILREDMI 12 SKY BLU | 0.0010 | 0.0218 | 0.05 | 0.0006 | 15.05 | ratio_pkg/prod=0.05 (embalaje=producto, deberia ser >1.2) |
| `01415001014494` | VENTILADOR BASTILIPO MALIBÚ BL | 0.0481 | 0.7318 | 0.07 | 0.0957 | 15.03 | ratio_pkg/prod=0.07 (embalaje=producto, deberia ser >1.2) |
| `01415001014503` | VENTILADOR BASTILIPO CAPRI BLA | 0.0497 | 0.7841 | 0.06 | 0.0957 | 15.02 | ratio_pkg/prod=0.06 (embalaje=producto, deberia ser >1.2) |
| `01431001010023` | PANTALLA LED 43  UHD XIAOMI MI | 0.0974 | 0.1898 | 0.51 | 0.0006 | 14.96 | ratio_pkg/prod=0.51 (embalaje=producto, deberia ser >1.2); r |
| `01415001014498` | VENTILADOR BASTILIPO CALA BLAN | 0.0316 | 0.2677 | 0.12 | 0.0957 | 14.93 | ratio_pkg/prod=0.12 (embalaje=producto, deberia ser >1.2) |
| `01361001010224` | VENTILADOR DE PIE INFINITON BN | 0.0275 | 0.2000 | 0.14 | 0.0957 | 14.87 | ratio_pkg/prod=0.14 (embalaje=producto, deberia ser >1.2) |
| `01415001014831` | VENTILADOR HAEGER SMOOTH WIND  | 0.0286 | 0.2080 | 0.14 | 0.0957 | 14.83 | ratio_pkg/prod=0.14 (embalaje=producto, deberia ser >1.2) |
| `04354001010039` | PLACA INDUCCION 4 FUEGOS 60CM  | 0.0481 | 0.3060 | 0.16 | 0.1938 | 14.82 | ratio_pkg/prod=0.16 (embalaje=producto, deberia ser >1.2); r |
| `01415001014222` | VENTILADOR INFINITON DE PIE BL | 0.0286 | 0.2000 | 0.14 | 0.0957 | 14.78 | ratio_pkg/prod=0.14 (embalaje=producto, deberia ser >1.2) |
| `00748001010012` | STEREO EARPHONES COLOR BUDS GR | 0.0002 | 0.0003 | 0.67 | 0.1199 | 14.73 | ratio_pkg/prod=0.67 (embalaje=producto, deberia ser >1.2); r |
| `01199001010399` | CONGA ROCKSTAR RS70 PET FLEX A | 0.0390 | 0.2768 | 0.14 | 0.1199 | 14.71 | ratio_pkg/prod=0.14 (embalaje=producto, deberia ser >1.2) |
| `01415001013473` | HORNO ORBEGOZO 39L SOBREMESA P | 0.0183 | 0.0656 | 0.28 | 0.1938 | 14.57 | ratio_pkg/prod=0.28 (embalaje=producto, deberia ser >1.2); r |
| `01415001013697` | HORNO PRINCESS 45L CONVECCION  | 0.0183 | 0.0656 | 0.28 | 0.1938 | 14.57 | ratio_pkg/prod=0.28 (embalaje=producto, deberia ser >1.2); r |
| `00703001010212` | CAMPANA 60 SPLUS 6010X CATA 02 | 0.0538 | 0.3135 | 0.17 | 0.1673 | 14.42 | ratio_pkg/prod=0.17 (embalaje=producto, deberia ser >1.2) |

---
## AUDIT 8 — Ratio Producto/Paquete Extremos

Flag: ratio vol_logistico/vol_producto > 12x (imposiblemente grande) o < 0.05x (imposiblemente pequeño).
Excluye: CUADRO, ESPEJO, ALFOMBRA, TEXTIL (pueden estar enrollados/doblados).

Total productos flagados: **864**
  - Ratio > 12x (embalaje enorme): 833
  - Ratio < 0.05x (embalaje imposiblemente pequeño): 31

### Todos los productos flagados por audit8

| COD | Descripción | Vol Log | Vol Prod | Ratio | Lado | Capa | Layer |
|-----|-------------|---------|----------|-------|------|------|-------|
| `00860001014573` | LAMPARA TECHO METAL CRISTAL 83X83X1 | 0.8827 | 0.0001 | **8827.0x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00664001010052` | SINFONIER ROMANTICA 4C MULTICOLOR R | 0.7484 | 0.0001 | **7484.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00664001010129` | MESITA BERNA 2C BLANCO BERNA I-4562 | 0.7484 | 0.0001 | **7484.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00664001010130` | MESITA BRUNA 1P CERA/CERA BRUNA 131 | 0.7484 | 0.0001 | **7484.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00664001010131` | MESITA BRUNA 1P CERA/GRIS ANT BRUNA | 0.7484 | 0.0001 | **7484.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00664001010133` | MESITA CUSCO 2C CERA/GRIS T-BLANCO  | 0.7484 | 0.0001 | **7484.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00664001010140` | MESITA MAX 2C BLANCO MAX 16103 | 0.7484 | 0.0001 | **7484.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00664001010141` | MESITA MAX 2C VERDE PETROLEO MAX 16 | 0.7484 | 0.0001 | **7484.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014643` | SILLON POLIESTER 90X87X65 MODULAR B | 0.4795 | 0.0001 | **4795.0x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00860001014644` | SILLON POLIESTER 90X87X65 MODULAR G | 0.4795 | 0.0001 | **4795.0x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00664001010040` | MESITA ROMANTICA 3C MULTICOLOR ROMA | 0.4051 | 0.0001 | **4051.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014575` | CABECERO CAMA POLIESTER MADERA 160X | 0.4051 | 0.0001 | **4051.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014576` | CABECERO CAMA POLIESTER MADERA 160X | 0.4051 | 0.0001 | **4051.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014637` | CABECERO CAMA RUBBERWOOD RATAN 180X | 0.4051 | 0.0001 | **4051.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016442` | CABECERO CAMA TECA FIBRA 165X5,5X10 | 0.4051 | 0.0001 | **4051.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014590` | BANCO TECA 150X55X90 NATURAL MARRON | 0.7418 | 0.0002 | **3709.0x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00860001014598` | MESA CENTRO MDF ACERO 120X60X44 NEG | 0.3672 | 0.0001 | **3672.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014609` | MESA CENTRO ACACIA MARMOL 70X70X43  | 0.3672 | 0.0001 | **3672.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015762` | MESA CENTRO HORMIGON 91X91X38 GRIS  | 0.7720 | 0.0003 | **2573.3x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014604` | CABECERO CAMA MADERA 180X6X120 BLAN | 0.4051 | 0.0002 | **2025.5x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014610` | CABECERO CAMA ROBLE POLIESTER 180X1 | 0.4051 | 0.0002 | **2025.5x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014611` | CABECERO CAMA ROBLE POLIESTER 180X1 | 0.4051 | 0.0002 | **2025.5x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014633` | CABECERO CAMA LINO RUBBERWOOD 160X1 | 0.4051 | 0.0002 | **2025.5x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014635` | CABECERO CAMA LINO RUBBERWOOD 160X1 | 0.4051 | 0.0002 | **2025.5x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014636` | CABECERO CAMA LINO RUBBERWOOD 160X1 | 0.4051 | 0.0002 | **2025.5x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014592` | MESA CENTRO ABETO RATAN 106X55X46 M | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014597` | MESA COMEDOR MDF ACERO 160X90X76 NE | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014607` | MESA COMEDOR ABETO METAL 161X90X75  | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014648` | MESA CENTRO ABETO CRISTAL 100X100X4 | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015966` | MESA CENTRO ACACIA 80X80X38 MARRON  | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016019` | MESA CENTRO ACACIA 80X80X38 BLANCO  | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016115` | MESA CENTRO SET 2 MANGO 98X51X47 MB | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016667` | MESA CENTRO SET 2 MANGO 75X75X38 MB | 0.3672 | 0.0002 | **1836.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014572` | LAMPARA TECHO METAL MDF 50X50X73 50 | 0.1827 | 0.0001 | **1827.0x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00860001014608` | CABECERO CAMA POLIESTER MDF 168X10X | 0.4051 | 0.0003 | **1350.3x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014632` | CABECERO CAMA LINO RUBBERWOOD 160X1 | 0.4051 | 0.0003 | **1350.3x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014621` | MECEDORA HAYA 81X58X90 MECEDORA POL | 0.3983 | 0.0003 | **1327.7x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00664001010031` | MESITA MIRANDA 2 CAJONES AZUL 7546/ | 0.1318 | 0.0001 | **1318.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00664001010177` | MESITA MIRANDA 2 CAJONES MIRANDA ** | 0.1318 | 0.0001 | **1318.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001014589` | ESTANTERIA ABETO METAL 67X40X155 NE | 0.1318 | 0.0001 | **1318.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015655` | LAMPARA PIE PAPEL ACERO 40X40X81 LA | 0.1297 | 0.0001 | **1297.0x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00860001015648` | LAMPARA PIE MADERA METAL 38X38X173  | 0.2500 | 0.0002 | **1250.0x** | HIGH | 3 | `ratio_desde_descripcion_fix5` |
| `00860001014638` | MESA COMEDOR METAL PIEDRA SINTERIZA | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015799` | MESA CENTRO OLMO 110X70X40 MARRON M | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015809` | APARADOR ACACIA 100X40X77 MARRON CL | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015824` | MESA CENTRO MADERA RECICLADA 140X60 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015851` | MESA CENTRO ROBLE ALUMINIO 120X60X3 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015871` | MESA CENTRO MANGO METAL 120X60X45 N | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015886` | MESA CENTRO MANGO 81X81X45 NATURAL  | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015924` | MESA CENTRO MANGO MARMOL 90X90X42 N | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015936` | MESA CENTRO MARMOL MANGO 85X85X45 B | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015982` | MESA CENTRO MANGO METAL 116X60X46 N | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015994` | MESA CENTRO ACACIA METAL 115X60X45  | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001015998` | MESA CENTRO ACACIA MARMOL 115X65X45 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016022` | APARADOR MADERA MANGO 80X45X97 2 PU | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016065` | MESA CENTRO OLMO MACIZO 167X41X42,5 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016079` | APARADOR TECA RECICLADA CRISTAL 90X | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016080` | MESA CENTRO MDF PU 120X60X40 BLANCO | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016104` | MESA CENTRO ACACIA 80X80X45 NATURAL | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016161` | APARADOR ACACIA 85X40X80 MARRON CLA | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016165` | APARADOR MADERA 91,5X40X90 TALLADO  | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016171` | MESA CENTRO MANGO 137X60X42 BLANCO  | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016178` | MESA CENTRO MANGO 120X60X45 NATURAL | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016188` | MESA CENTRO MANGO 100X60X45 NATURAL | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016265` | MESA CENTRO SET 3 TECA RECICLADA 80 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016284` | MESA CENTRO MADERA RECICLADA PINO 1 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016343` | APARADOR ACACIA METAL 88X40X80 MB-2 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016361` | APARADOR ACACIA 80X40X95 MB-219920 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016363` | APARADOR MANGO METAL 81X45X75 MANDA | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016380` | MESA CENTRO OLMO MACIZO 140X71X35 N | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016389` | MESA CENTRO FIBRA TECA 120X60X45 CR | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016413` | APARADOR ROBLE 80X40X90 NATURAL MAR | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016432` | MESA CENTRO MADERA RECICLADA MARMOL | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016477` | MESA CENTRO ACACIA METAL 110X60X45  | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016498` | APARADOR MDF 100X40X75 MB-223044 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016518` | APARADOR MANGO 85X42X72 MB-223082 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016521` | MESA CENTRO MANGO 76X76X46 BANDEJA  | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016534` | MESA CENTRO MANGO MARMOL 120X73,5X3 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016570` | VITRINA MANGO METAL 80X30X120 MB-22 | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |
| `00860001016638` | MESA CENTRO MANGO MARMOL 120X60X43  | 0.3672 | 0.0003 | **1224.0x** | HIGH | 4 | `promedio_subfamilia_corregido` |

---
## AUDIT 9 — Top 100 Sospechosos GLOBAL

Productos que aparecen en ≥2 audits o tienen impacto severo en 1 audit. Ordenados por num_audits DESC, impacto DESC.

Total productos en lista global: 7,588

| # | COD | Descripción | Vol Log | Vol Prod | Capa | Audits | Impact | Layer |
|---|-----|-------------|---------|----------|------|--------|--------|-------|
| 1 | `01027001012399` | COLCHON ENROLLADO 90X200 KUBIC | 0.0100 | 0.3600 | 1 | **A1,2,3,4,6,8** | 1.6275 | `erp_ground_truth` |
| 2 | `01027001010047` | COLCHON ENROLLADO 90X190 KUBIC | 0.0100 | 0.3420 | 1 | **A1,2,3,4,6,8** | 1.5915 | `erp_ground_truth` |
| 3 | `04887001010083` | ALBERO BUNCH MAR 360MICROLED CLASSI | 0.0200 | 0.5760 | 1 | **A1,2,3,4,6,8** | 1.2030 | `erp_ground_truth` |
| 4 | `04343001010256` | COMBINADO 203X70 NOFROST C BALAY 3K | 1.2072 | 0.0952 | 2 | **A1,2,3,7,8** | 4.7502 | `gemini_embalaje` |
| 5 | `04343001010209` | COMBINADO 203X60 NOFROST PUERTAS CR | 1.0672 | 0.0804 | 2 | **A1,2,3,7,8** | 4.0946 | `gemini_embalaje` |
| 6 | `04343001010190` | COMBINADO 203X60 CRISTAL NEGRO C BA | 1.0552 | 0.0810 | 2 | **A1,2,3,7,8** | 4.0328 | `gemini_embalaje` |
| 7 | `04370001010019` | COMBINADO 200 INOX CLASE D LG GBB62 | 1.0420 | 0.0743 | 2 | **A1,2,3,7,8** | 3.6774 | `gemini_embalaje` |
| 8 | `04370001010034` | COMBINADO 200 INOX CLASE C LG GBB62 | 1.0439 | 0.0815 | 2 | **A1,2,3,7,8** | 3.6653 | `gemini_embalaje` |
| 9 | `04370001010056` | COMBI 2,00, CLASE C, DISPLAY EN PUE | 1.0439 | 0.0815 | 2 | **A1,2,3,7,8** | 3.6653 | `gemini_embalaje` |
| 10 | `04453001010051` | COMBINADO 201X59,5CM CLASE E FAGOR  | 0.9510 | 0.0777 | 2 | **A1,2,3,7,8** | 3.4899 | `gemini_embalaje` |
| 11 | `01382001010057` | COMBINADO 201X59,5 NO FROST A++ EDE | 0.9212 | 0.0753 | 2 | **A1,2,3,7,8** | 3.3465 | `gemini_embalaje` |
| 12 | `01415001014492` | VENTILADOR BASTILIPO TECHO (CALPE)  | 0.0201 | 0.7290 | 2 | **A1,2,3,7,8** | 2.2065 | `gemini_embalaje` |
| 13 | `00664001010116` | CAMA CABA¿A MONTESSORI ARTHUR 90X20 | 0.7484 | 0.0040 | 4 | **A1,2,3,5,8** | 2.1909 | `promedio_subfamilia_corregido` |
| 14 | `00664001010129` | MESITA BERNA 2C BLANCO BERNA I-4562 | 0.7484 | 0.0001 | 4 | **A1,2,5,6,8** | 1.8518 | `promedio_subfamilia_corregido` |
| 15 | `00664001010130` | MESITA BRUNA 1P CERA/CERA BRUNA 131 | 0.7484 | 0.0001 | 4 | **A1,2,5,6,8** | 1.8518 | `promedio_subfamilia_corregido` |
| 16 | `00664001010131` | MESITA BRUNA 1P CERA/GRIS ANT BRUNA | 0.7484 | 0.0001 | 4 | **A1,2,5,6,8** | 1.8518 | `promedio_subfamilia_corregido` |
| 17 | `00664001010133` | MESITA CUSCO 2C CERA/GRIS T-BLANCO  | 0.7484 | 0.0001 | 4 | **A1,2,5,6,8** | 1.8518 | `promedio_subfamilia_corregido` |
| 18 | `00664001010140` | MESITA MAX 2C BLANCO MAX 16103 | 0.7484 | 0.0001 | 4 | **A1,2,5,6,8** | 1.8518 | `promedio_subfamilia_corregido` |
| 19 | `00664001010141` | MESITA MAX 2C VERDE PETROLEO MAX 16 | 0.7484 | 0.0001 | 4 | **A1,2,5,6,8** | 1.8518 | `promedio_subfamilia_corregido` |
| 20 | `04376001010716` | ARMARIO 2 PUERTAS 2 CAJONES 208,6X1 | 0.1200 | 1.4479 | 1 | **A1,2,3,4,6** | 1.6366 | `erp_ground_truth` |
| 21 | `04376001010717` | ARMARIO 2 PUERTAS 2 CAJONES 208,6X1 | 0.1200 | 1.4479 | 1 | **A1,2,3,4,6** | 1.6366 | `erp_ground_truth` |
| 22 | `04376001010718` | ARMARIO 2 PUERTAS 2 CAJONES 208,6X1 | 0.1200 | 1.4479 | 1 | **A1,2,3,4,6** | 1.6366 | `erp_ground_truth` |
| 23 | `01415001014501` | VENTILADOR BASTILIPO CANCUN BLANCO  | 0.0222 | 0.5072 | 2 | **A1,2,3,7,8** | 1.5306 | `gemini_embalaje` |
| 24 | `01415001010602` | VENTILADOR BASTILIPO BERMEO BLANCO  | 0.0174 | 0.4966 | 2 | **A1,2,3,7,8** | 1.5229 | `gemini_embalaje` |
| 25 | `01415001014500` | VENTILADOR BASTILIPO BERMEO NIQUEL  | 0.0210 | 0.4410 | 2 | **A1,2,3,7,8** | 1.3380 | `gemini_embalaje` |
| 26 | `00664001010010` | CAMA NIDO 0.90 KIARA 90X190 BLANCO/ | 0.4051 | 0.0010 | 4 | **A2,3,4,5,8** | 1.0813 | `promedio_subfamilia_corregido` |
| 27 | `00664001010016` | CAMA NIDO 0.90 REDONA 90X190 GRIS C | 0.4051 | 0.0010 | 4 | **A2,3,4,5,8** | 1.0813 | `promedio_subfamilia_corregido` |
| 28 | `00664001010008` | CAMA 1.35/1.40 GABI C/CAJON BLANCO  | 0.4051 | 0.0030 | 4 | **A2,3,4,5,8** | 1.0775 | `promedio_subfamilia_corregido` |
| 29 | `00664001010058` | CAMA AMON 90X200 BLANCO LAC/GRIS AM | 0.4051 | 0.0030 | 4 | **A2,3,4,5,8** | 1.0771 | `promedio_subfamilia_corregido` |
| 30 | `00664001010009` | CAMA 1.60 GABI C/CAJON BLANCO LAC/C | 0.4051 | 0.0040 | 4 | **A2,3,4,5,8** | 1.0759 | `promedio_subfamilia_corregido` |
| 31 | `00664001010040` | MESITA ROMANTICA 3C MULTICOLOR ROMA | 0.4051 | 0.0001 | 4 | **A2,4,5,6,8** | 0.7834 | `promedio_subfamilia_corregido` |
| 32 | `00362019010304` | SILLA DALLAS 77 VERDE BOGAL CG1544V | 0.0100 | 0.2232 | 1 | **A1,2,3,4,8** | 0.7182 | `erp_ground_truth` |
| 33 | `04342001010013` | CAFETERA INTEGRABLE 19 BARES BOSCH  | 0.1729 | 0.0101 | 2 | **A1,2,6,7,8** | 0.7122 | `gemini_embalaje` |
| 34 | `00860001016242` | ARMARIO MADERA RECICLADA 45X90X180  | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7076 | `promedio_subfamilia_corregido` |
| 35 | `00860001016321` | ARMARIO ABETO MDF 78X55X180 NATURAL | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7075 | `promedio_subfamilia_corregido` |
| 36 | `00860001015975` | ARMARIO ABETO MDF 85,5X50,5X186,2 R | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7075 | `promedio_subfamilia_corregido` |
| 37 | `00860001015976` | ARMARIO ABETO MDF 85,5X50,5X186,2 N | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7075 | `promedio_subfamilia_corregido` |
| 38 | `00860001015977` | ARMARIO ABETO MDF 85,5X50,5X186,2 B | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7075 | `promedio_subfamilia_corregido` |
| 39 | `00860001016061` | ARMARIO ABETO METAL 88X52X180 TALLA | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7075 | `promedio_subfamilia_corregido` |
| 40 | `00860001016396` | ARMARIO ABETO METAL 88X52X180 TALLA | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7075 | `promedio_subfamilia_corregido` |
| 41 | `00860001016465` | ARMARIO ABETO RATAN 79X58X180 NATUR | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7075 | `promedio_subfamilia_corregido` |
| 42 | `00860001015845` | ARMARIO ALAMO METAL 110X50X180 NEGR | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7073 | `promedio_subfamilia_corregido` |
| 43 | `00860001016368` | ARMARIO OLMO MACIZO 100X50X200 2 PU | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7073 | `promedio_subfamilia_corregido` |
| 44 | `00860001016212` | ARMARIO TECA 105X58X168 SURTIDO TAL | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7073 | `promedio_subfamilia_corregido` |
| 45 | `00860001016423` | ARMARIO BAMBU RATAN 120X60X180 NATU | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7070 | `promedio_subfamilia_corregido` |
| 46 | `00860001016294` | ARMARIO TECA 122X51X216 PIEZA UNICA | 0.1318 | 0.0010 | 4 | **A2,3,4,6,8** | 0.7070 | `promedio_subfamilia_corregido` |
| 47 | `04376001010330` | MESA CENTRO TAPA CRISTAL CAMBRIA SA | 0.0100 | 0.2723 | 1 | **A1,2,3,4,8** | 0.7065 | `erp_ground_truth` |
| 48 | `01415001010610` | PLANCHA UFESA PELO X-TREME INFRARED | 0.0018 | 0.0909 | 2 | **A1,2,3,7,8** | 0.3666 | `gemini_embalaje` |
| 49 | `01199001010401` | CUT-X 4500 TEXTILE 5748 CECOTEC | 0.0014 | 0.0759 | 2 | **A1,2,3,7,8** | 0.2730 | `gemini_embalaje` |
| 50 | `00664001010007` | MESA REDONDA BLANCA ODA 11992 | 0.1318 | 0.0010 | 4 | **A2,3,4,5,8** | 0.2617 | `promedio_subfamilia_corregido` |
| 51 | `00664001010030` | MESA REDON. ODA 110 CM NEGRO ODA 11 | 0.1318 | 0.0010 | 4 | **A2,3,4,5,8** | 0.2617 | `promedio_subfamilia_corregido` |
| 52 | `01408001010037` | SACACORCHOS DE PARED TRADICIONAL NE | 0.0800 | 0.0057 | 1 | **A2,3,4,5,8** | 0.2237 | `erp_ground_truth` |
| 53 | `00664001010134` | MESITA ESTEBAN 1C1H BLANCO/CERA BLA | 0.0200 | 0.0200 | 1 | **A1,2,4,5,6** | 0.1251 | `erp_ground_truth` |
| 54 | `00664001010135` | MESITA ESTEBAN 1C1H VERDE KAKI 444C | 0.0200 | 0.0200 | 1 | **A1,2,4,5,6** | 0.1251 | `erp_ground_truth` |
| 55 | `00664001010113` | COMODA MAX 3C BLANCO MAX 16107 | 0.0700 | 0.0700 | 1 | **A1,2,4,5,6** | 0.1038 | `erp_ground_truth` |
| 56 | `00664001010114` | COMODA MAX 3C VERDE PETROLEO MAX 16 | 0.0700 | 0.0700 | 1 | **A1,2,4,5,6** | 0.1038 | `erp_ground_truth` |
| 57 | `00748001010012` | STEREO EARPHONES COLOR BUDS GREEN V | 0.0002 | 0.0003 | 2 | **A1,2,4,5,7** | 0.0049 | `gemini_embalaje` |
| 58 | `01172001010018` | APPLE WATCH SE GPS+CELL  44MM MIDNI | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 59 | `01172001010019` | APPLE WATCH SE GPS+CELL  40MM STARL | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 60 | `01172001010768` | APPLE WATCH SE GPS + CELL 40MM MIDN | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 61 | `01172001010786` | APPLE WATCH SE GPS 40MM STARLIGHT A | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 62 | `01172001010925` | APPLE WATCH SERIES 10 GPS + CELL 42 | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 63 | `01172001010926` | APPLE WATCH SERIES 10 GPS + CELL 42 | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 64 | `01172001010931` | APPLE WATCH SERIES 10 GPS + CELL 42 | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 65 | `01172001010934` | APPLE WATCH SERIES 10 GPS + CELL 42 | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 66 | `01172001010939` | APPLE WATCH SERIES 10 GPS + CELL 46 | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 67 | `01172001010946` | APPLE WATCH SERIES 10 GPS + CELL 46 | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 68 | `01172001010947` | APPLE WATCH SERIES 10 GPS + CELL 46 | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 69 | `01172001010958` | APPLE WATCH SERIES 10 GPS 42MM JET  | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 70 | `01172001010969` | APPLE WATCH SERIES 10 GPS 46MM ROSE | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 71 | `01172001010973` | APPLE WATCH SERIES 10 GPS 46MM SILV | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0044 | `gemini_embalaje` |
| 72 | `00748001010068` | CARGADOR DE COCHE 1 A CON CONECTOR  | 0.0005 | N/A | 2 | **A1,2,4,5,7** | 0.0042 | `gemini_embalaje` |
| 73 | `00748001010064` | CARGADOR DE COCHE  CON CONEXION LIG | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0040 | `gemini_embalaje` |
| 74 | `00748001010197` | REGLETA VIVANCO 3 TOMAS CON INTERRU | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0040 | `gemini_embalaje` |
| 75 | `00748001010075` | MANDO TV COMPATIBLE SONY A¿O 2000 V | 0.0011 | 0.0011 | 2 | **A1,2,4,5,7** | 0.0038 | `gemini_embalaje` |
| 76 | `01172001010053` | AURICULAR + MIC APPLE AIRPODS 2ª GE | 0.0004 | 0.0001 | 2 | **A1,2,4,5,7** | 0.0013 | `gemini_embalaje` |
| 77 | `00748001010021` | AURICULARES BLUETOOTH VIVANCO SPORT | 0.0006 | N/A | 2 | **A1,2,4,5,7** | 0.0002 | `gemini_embalaje` |
| 78 | `00860001015704` | PERGOLA HIERRO 350X350X350 HECHO A  | 0.0430 | 42.8750 | 1 | **A1,2,3,8** | 85.9557 | `erp_ground_truth` |
| 79 | `00860001014247` | PERGOLA HIERRO 304X304X332 CENADOR  | 1.5326 | 30.6821 | 3 | **A1,2,3,8** | 59.8901 | `ratio_subfamilia` |
| 80 | `00860001014248` | PERGOLA HIERRO 304X304X332 CENADOR  | 1.5326 | 30.6821 | 3 | **A1,2,3,8** | 59.8901 | `ratio_subfamilia` |
| 81 | `00860001015756` | BANCO ACERO 215X120X180 COLUMPIO 3  | 4.6394 | 0.0050 | 3 | **A1,2,3,8** | 17.5754 | `ratio_desde_descripcion_fix5` |
| 82 | `01361001010608` | AIRE ACONDICIONADO CHS SPLIT INVERT | 1.7000 | 0.0896 | 1 | **A1,2,3,8** | 6.2673 | `erp_ground_truth` |
| 83 | `00860001015685` | SILLON RATAN 157X68X145,5 2 PLAZAS  | 1.5518 | 0.0020 | 3 | **A1,2,3,8** | 5.1365 | `ratio_desde_descripcion_fix5` |
| 84 | `00860001015785` | SILLON FOAM POLIESTER 182X167X52,5  | 1.5031 | 0.0020 | 3 | **A1,2,3,8** | 4.9417 | `ratio_desde_descripcion_fix5` |
| 85 | `00860001015786` | SILLON POLIESTER FOAM 182X167X52,5  | 1.5031 | 0.0020 | 3 | **A1,2,3,8** | 4.9417 | `ratio_desde_descripcion_fix5` |
| 86 | `01415001014766` | FRIGORIFICO SAMSUNG SIDE BY SIDE 17 | 1.4540 | 0.0719 | 2 | **A1,2,3,8** | 4.4091 | `gemini_embalaje` |
| 87 | `00860001015640` | LAMPARA PIE TECA HIERRO 75X75X200 H | 1.1261 | 0.0010 | 3 | **A1,2,3,8** | 3.7006 | `ratio_desde_descripcion_fix5` |
| 88 | `01415001015452` | FRIGORIFICO LG COMBI 203 X 70 X 675 | 1.2183 | 0.0996 | 2 | **A1,2,3,8** | 3.4109 | `gemini_embalaje` |
| 89 | `01415001015537` | FRIGORIFICO BALAY COMBI 203 X 70 CL | 1.2101 | 0.0952 | 2 | **A1,2,3,8** | 3.3869 | `gemini_embalaje` |
| 90 | `01415001015538` | FRIGORIFICO BALAY COMBI 203 X 70 CL | 1.2072 | 0.0952 | 2 | **A1,2,3,8** | 3.3753 | `gemini_embalaje` |
| 91 | `00860001015710` | ISLA COCINA SET 3 ALUMINIO PS 236X5 | 1.0727 | 0.0010 | 3 | **A1,2,3,8** | 3.3161 | `ratio_desde_descripcion_fix5` |
| 92 | `01415001015571` | FRIGORIFICO BOSCH COMBI 203 X 70 CL | 1.1754 | 0.0948 | 2 | **A1,2,3,8** | 3.2489 | `gemini_embalaje` |
| 93 | `00860001016705` | SILLON MADERA ENEA 125X58X155 ALGOD | 1.0586 | 0.0010 | 3 | **A1,2,3,8** | 3.1651 | `ratio_desde_descripcion_fix5` |
| 94 | `04341001010159` | FRIGORIFICO SIEMENS COMBI 203 X70 X | 1.2072 | 0.0952 | 2 | **A1,2,3,8** | 3.1500 | `gemini_embalaje` |
| 95 | `04343001010139` | FRIGORIFICO BALAY COMBI 203 X 70 CL | 1.1970 | 0.0952 | 2 | **A1,2,3,8** | 3.0933 | `gemini_embalaje` |
| 96 | `00860001016704` | SILLON MADERA ENEA 87X73X163 ALGODO | 0.9752 | 0.0010 | 3 | **A1,2,3,8** | 2.8316 | `ratio_desde_descripcion_fix5` |
| 97 | `00860001016706` | SILLON MADERA ENEA 87X73X163 ALGODO | 0.9752 | 0.0010 | 3 | **A1,2,3,8** | 2.8316 | `ratio_desde_descripcion_fix5` |
| 98 | `00860001015641` | LAMPARA TECHO ACERO PATINADO 74X74X | 0.8661 | 0.0010 | 3 | **A1,2,3,8** | 2.6608 | `ratio_desde_descripcion_fix5` |
| 99 | `00860001015657` | LAMPARA PIE RAIZ DE TECA RECICLADA  | 0.8502 | 0.0010 | 3 | **A1,2,3,8** | 2.5973 | `ratio_desde_descripcion_fix5` |
| 100 | `00860001015633` | LAMPARA TECHO FIBRAS NATURALES 125X | 0.8446 | 0.0010 | 3 | **A1,2,3,8** | 2.5749 | `ratio_desde_descripcion_fix5` |

### Detalle de Top 20

#### #1: `01027001012399` — COLCHON ENROLLADO 90X200 KUBIC
- **Vol logístico**: 0.0100 m³
- **Vol producto**: 0.3600 m³
- **Capa**: 1 / Layer: `erp_ground_truth`
- **Audits que lo flagean**: A1, A2, A3, A4, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_COLCHON (vol=0.0100, p10=0.2306, p90=0.9009) (impact=0.2206)
  - A2: dispersion_grupo_01027__NINGUNO ratio=204.0x (impact=0.6369)
  - A3: ratio_prod_logistico=0.03x (vol_log=0.0100, vol_calc=0.3600) (impact=0.3500)
  - A4: vol_repetido_disparate=0.0100 (42 prods, 12 cats) (impact=0.0000)
  - A6: rango_esperado_COLCHON vol=0.0100 < min=0.08 (impact=0.0700)

#### #2: `01027001010047` — COLCHON ENROLLADO 90X190 KUBIC
- **Vol logístico**: 0.0100 m³
- **Vol producto**: 0.3420 m³
- **Capa**: 1 / Layer: `erp_ground_truth`
- **Audits que lo flagean**: A1, A2, A3, A4, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_COLCHON (vol=0.0100, p10=0.2306, p90=0.9009) (impact=0.2206)
  - A2: dispersion_grupo_01027__NINGUNO ratio=204.0x (impact=0.6369)
  - A3: ratio_prod_logistico=0.03x (vol_log=0.0100, vol_calc=0.3420) (impact=0.3320)
  - A4: vol_repetido_disparate=0.0100 (42 prods, 12 cats) (impact=0.0000)
  - A6: rango_esperado_COLCHON vol=0.0100 < min=0.08 (impact=0.0700)

#### #3: `04887001010083` — ALBERO BUNCH MAR 360MICROLED CLASSIC H90 0974583
- **Vol logístico**: 0.0200 m³
- **Vol producto**: 0.5760 m³
- **Capa**: 1 / Layer: `erp_ground_truth`
- **Audits que lo flagean**: A1, A2, A3, A4, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_TV (vol=0.0200, p10=0.0510, p90=0.6355) (impact=0.0310)
  - A2: dispersion_grupo_04887__NINGUNO ratio=206.4x (impact=0.0500)
  - A3: ratio_prod_logistico=0.03x (vol_log=0.0200, vol_calc=0.5760) (impact=0.5560)
  - A4: vol_repetido_disparate=0.0200 (32 prods, 11 cats) (impact=0.0000)
  - A6: rango_esperado_TV vol=0.0200 < min=0.03 (impact=0.0100)

#### #4: `04343001010256` — COMBINADO 203X70 NOFROST C BALAY 3KFC879BI
- **Vol logístico**: 1.2072 m³
- **Vol producto**: 0.0952 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=1.2072, p10=0.0045, p90=0.6633) (impact=0.5439)
  - A2: dispersion_grupo_04343__NINGUNO ratio=28.7x (impact=0.8703)
  - A3: ratio_prod_logistico=12.68x (vol_log=1.2072, vol_calc=0.0952) (impact=1.1120)
  - A7: gemini_sospechoso: ratio_vs_median=10.07 (med=0.1199) (impact=1.1120)
  - A8: ratio_pkg/prod=12.68x (vol_log=1.2072, vol_prod=0.0952) (impact=1.1120)

#### #5: `04343001010209` — COMBINADO 203X60 NOFROST PUERTAS CRISTAL BLANCO C BALAY 3KFC
- **Vol logístico**: 1.0672 m³
- **Vol producto**: 0.0804 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=1.0672, p10=0.0045, p90=0.6633) (impact=0.4039)
  - A2: dispersion_grupo_04343__NINGUNO ratio=28.7x (impact=0.7303)
  - A3: ratio_prod_logistico=13.28x (vol_log=1.0672, vol_calc=0.0804) (impact=0.9868)
  - A7: gemini_sospechoso: ratio_vs_median=8.90 (med=0.1199) (impact=0.9868)
  - A8: ratio_pkg/prod=13.27x (vol_log=1.0672, vol_prod=0.0804) (impact=0.9868)

#### #6: `04343001010190` — COMBINADO 203X60 CRISTAL NEGRO C BALAY 3KFC869NI
- **Vol logístico**: 1.0552 m³
- **Vol producto**: 0.0810 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=1.0552, p10=0.0045, p90=0.6633) (impact=0.3919)
  - A2: dispersion_grupo_04343__NINGUNO ratio=28.7x (impact=0.7183)
  - A3: ratio_prod_logistico=13.03x (vol_log=1.0552, vol_calc=0.0810) (impact=0.9742)
  - A7: gemini_sospechoso: ratio_vs_median=8.80 (med=0.1199) (impact=0.9742)
  - A8: ratio_pkg/prod=13.03x (vol_log=1.0552, vol_prod=0.0810) (impact=0.9742)

#### #7: `04370001010019` — COMBINADO 200 INOX CLASE D LG GBB62PZFGN
- **Vol logístico**: 1.0420 m³
- **Vol producto**: 0.0743 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=1.0420, p10=0.0045, p90=0.6633) (impact=0.3787)
  - A2: dispersion_grupo_04370__NINGUNO ratio=36.1x (impact=0.3956)
  - A3: ratio_prod_logistico=14.03x (vol_log=1.0420, vol_calc=0.0743) (impact=0.9677)
  - A7: gemini_sospechoso: ratio_vs_median=8.69 (med=0.1199) (impact=0.9677)
  - A8: ratio_pkg/prod=14.02x (vol_log=1.0420, vol_prod=0.0743) (impact=0.9677)

#### #8: `04370001010034` — COMBINADO 200 INOX CLASE C LG GBB62PZ5CN1
- **Vol logístico**: 1.0439 m³
- **Vol producto**: 0.0815 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=1.0439, p10=0.0045, p90=0.6633) (impact=0.3806)
  - A2: dispersion_grupo_04370__NINGUNO ratio=36.1x (impact=0.3975)
  - A3: ratio_prod_logistico=12.80x (vol_log=1.0439, vol_calc=0.0815) (impact=0.9624)
  - A7: gemini_sospechoso: ratio_vs_median=8.71 (med=0.1199) (impact=0.9624)
  - A8: ratio_pkg/prod=12.81x (vol_log=1.0439, vol_prod=0.0815) (impact=0.9624)

#### #9: `04370001010056` — COMBI 2,00, CLASE C, DISPLAY EN PUERTA, INOX LG GBB72NSUCN1
- **Vol logístico**: 1.0439 m³
- **Vol producto**: 0.0815 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=1.0439, p10=0.0045, p90=0.6633) (impact=0.3806)
  - A2: dispersion_grupo_04370__NINGUNO ratio=36.1x (impact=0.3975)
  - A3: ratio_prod_logistico=12.80x (vol_log=1.0439, vol_calc=0.0815) (impact=0.9624)
  - A7: gemini_sospechoso: ratio_vs_median=8.71 (med=0.1199) (impact=0.9624)
  - A8: ratio_pkg/prod=12.81x (vol_log=1.0439, vol_prod=0.0815) (impact=0.9624)

#### #10: `04453001010051` — COMBINADO 201X59,5CM CLASE E FAGOR 3FFK-6945
- **Vol logístico**: 0.9510 m³
- **Vol producto**: 0.0777 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=0.9510, p10=0.0045, p90=0.6633) (impact=0.2877)
  - A2: dispersion_grupo_04453__NINGUNO ratio=18.5x (impact=0.5823)
  - A3: ratio_prod_logistico=12.23x (vol_log=0.9510, vol_calc=0.0777) (impact=0.8733)
  - A7: gemini_sospechoso: ratio_vs_median=7.93 (med=0.1199) (impact=0.8733)
  - A8: ratio_pkg/prod=12.24x (vol_log=0.9510, vol_prod=0.0777) (impact=0.8733)

#### #11: `01382001010057` — COMBINADO 201X59,5 NO FROST A++ EDESA EFC-2032NFWH
- **Vol logístico**: 0.9212 m³
- **Vol producto**: 0.0753 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=0.9212, p10=0.0045, p90=0.6633) (impact=0.2579)
  - A2: dispersion_grupo_01382__NINGUNO ratio=139.9x (impact=0.5509)
  - A3: ratio_prod_logistico=12.23x (vol_log=0.9212, vol_calc=0.0753) (impact=0.8459)
  - A7: gemini_sospechoso: ratio_vs_median=7.68 (med=0.1199) (impact=0.8459)
  - A8: ratio_pkg/prod=12.23x (vol_log=0.9212, vol_prod=0.0753) (impact=0.8459)

#### #12: `01415001014492` — VENTILADOR BASTILIPO TECHO (CALPE) 106CM 4ASPAS 60W BLANCO 4
- **Vol logístico**: 0.0201 m³
- **Vol producto**: 0.7290 m³
- **Capa**: 2 / Layer: `gemini_embalaje`
- **Audits que lo flagean**: A1, A2, A3, A7, A8
- **Flags detalle**:
  - A1: outlier_cat_CLIMA (vol=0.0201, p10=0.0243, p90=0.1015) (impact=0.0042)
  - A2: dispersion_grupo_01415__NINGUNO ratio=17628.0x (impact=0.0756)
  - A3: ratio_prod_logistico=0.03x (vol_log=0.0201, vol_calc=0.7290) (impact=0.7089)
  - A7: gemini_sospechoso: ratio_pkg/prod=0.03 (embalaje=producto, deberia ser >1.2); ratio_vs_median=0.21 (med=0.0957) (impact=0.7089)
  - A8: ratio_pkg/prod=0.03x (vol_log=0.0201, vol_prod=0.7290) (impact=0.7089)

#### #13: `00664001010116` — CAMA CABA¿A MONTESSORI ARTHUR 90X200 ANTRACITA/ROB ARTHUR 15
- **Vol logístico**: 0.7484 m³
- **Vol producto**: 0.0040 m³
- **Capa**: 4 / Layer: `promedio_subfamilia_corregido`
- **Audits que lo flagean**: A1, A2, A3, A5, A8
- **Flags detalle**:
  - A1: outlier_cat_OTRO (vol=0.7484, p10=0.0045, p90=0.6633) (impact=0.0851)
  - A2: dispersion_grupo_00664__GENERAL ratio=7484.0x (impact=0.6166)
  - A3: ratio_prod_logistico=209.18x (vol_log=0.7484, vol_calc=0.0036) (impact=0.7448)
  - A5: supplier_sospechoso_00664 score=42.3 (impact=0.0000)
  - A8: ratio_pkg/prod=187.10x (vol_log=0.7484, vol_prod=0.0040) (impact=0.7444)

#### #14: `00664001010129` — MESITA BERNA 2C BLANCO BERNA I-4562-BL
- **Vol logístico**: 0.7484 m³
- **Vol producto**: 0.0001 m³
- **Capa**: 4 / Layer: `promedio_subfamilia_corregido`
- **Audits que lo flagean**: A1, A2, A5, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_MESITA (vol=0.7484, p10=0.0233, p90=0.7099) (impact=0.0385)
  - A2: dispersion_grupo_00664__GENERAL ratio=7484.0x (impact=0.6166)
  - A5: supplier_sospechoso_00664 score=42.3 (impact=0.0000)
  - A6: rango_esperado_MESITA vol=0.7484 > max=0.3 (impact=0.4484)
  - A8: ratio_pkg/prod=7484.00x (vol_log=0.7484, vol_prod=0.0001) (impact=0.7483)

#### #15: `00664001010130` — MESITA BRUNA 1P CERA/CERA BRUNA 13161
- **Vol logístico**: 0.7484 m³
- **Vol producto**: 0.0001 m³
- **Capa**: 4 / Layer: `promedio_subfamilia_corregido`
- **Audits que lo flagean**: A1, A2, A5, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_MESITA (vol=0.7484, p10=0.0233, p90=0.7099) (impact=0.0385)
  - A2: dispersion_grupo_00664__GENERAL ratio=7484.0x (impact=0.6166)
  - A5: supplier_sospechoso_00664 score=42.3 (impact=0.0000)
  - A6: rango_esperado_MESITA vol=0.7484 > max=0.3 (impact=0.4484)
  - A8: ratio_pkg/prod=7484.00x (vol_log=0.7484, vol_prod=0.0001) (impact=0.7483)

#### #16: `00664001010131` — MESITA BRUNA 1P CERA/GRIS ANT BRUNA 13165
- **Vol logístico**: 0.7484 m³
- **Vol producto**: 0.0001 m³
- **Capa**: 4 / Layer: `promedio_subfamilia_corregido`
- **Audits que lo flagean**: A1, A2, A5, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_MESITA (vol=0.7484, p10=0.0233, p90=0.7099) (impact=0.0385)
  - A2: dispersion_grupo_00664__GENERAL ratio=7484.0x (impact=0.6166)
  - A5: supplier_sospechoso_00664 score=42.3 (impact=0.0000)
  - A6: rango_esperado_MESITA vol=0.7484 > max=0.3 (impact=0.4484)
  - A8: ratio_pkg/prod=7484.00x (vol_log=0.7484, vol_prod=0.0001) (impact=0.7483)

#### #17: `00664001010133` — MESITA CUSCO 2C CERA/GRIS T-BLANCO CUSCO 11219
- **Vol logístico**: 0.7484 m³
- **Vol producto**: 0.0001 m³
- **Capa**: 4 / Layer: `promedio_subfamilia_corregido`
- **Audits que lo flagean**: A1, A2, A5, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_MESITA (vol=0.7484, p10=0.0233, p90=0.7099) (impact=0.0385)
  - A2: dispersion_grupo_00664__GENERAL ratio=7484.0x (impact=0.6166)
  - A5: supplier_sospechoso_00664 score=42.3 (impact=0.0000)
  - A6: rango_esperado_MESITA vol=0.7484 > max=0.3 (impact=0.4484)
  - A8: ratio_pkg/prod=7484.00x (vol_log=0.7484, vol_prod=0.0001) (impact=0.7483)

#### #18: `00664001010140` — MESITA MAX 2C BLANCO MAX 16103
- **Vol logístico**: 0.7484 m³
- **Vol producto**: 0.0001 m³
- **Capa**: 4 / Layer: `promedio_subfamilia_corregido`
- **Audits que lo flagean**: A1, A2, A5, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_MESITA (vol=0.7484, p10=0.0233, p90=0.7099) (impact=0.0385)
  - A2: dispersion_grupo_00664__GENERAL ratio=7484.0x (impact=0.6166)
  - A5: supplier_sospechoso_00664 score=42.3 (impact=0.0000)
  - A6: rango_esperado_MESITA vol=0.7484 > max=0.3 (impact=0.4484)
  - A8: ratio_pkg/prod=7484.00x (vol_log=0.7484, vol_prod=0.0001) (impact=0.7483)

#### #19: `00664001010141` — MESITA MAX 2C VERDE PETROLEO MAX 16104
- **Vol logístico**: 0.7484 m³
- **Vol producto**: 0.0001 m³
- **Capa**: 4 / Layer: `promedio_subfamilia_corregido`
- **Audits que lo flagean**: A1, A2, A5, A6, A8
- **Flags detalle**:
  - A1: outlier_cat_MESITA (vol=0.7484, p10=0.0233, p90=0.7099) (impact=0.0385)
  - A2: dispersion_grupo_00664__GENERAL ratio=7484.0x (impact=0.6166)
  - A5: supplier_sospechoso_00664 score=42.3 (impact=0.0000)
  - A6: rango_esperado_MESITA vol=0.7484 > max=0.3 (impact=0.4484)
  - A8: ratio_pkg/prod=7484.00x (vol_log=0.7484, vol_prod=0.0001) (impact=0.7483)

#### #20: `04376001010716` — ARMARIO 2 PUERTAS 2 CAJONES 208,6X100X51,6 AURA 2025 *** NO 
- **Vol logístico**: 0.1200 m³
- **Vol producto**: 1.4479 m³
- **Capa**: 1 / Layer: `erp_ground_truth`
- **Audits que lo flagean**: A1, A2, A3, A4, A6
- **Flags detalle**:
  - A1: outlier_cat_ARMARIO (vol=0.1200, p10=0.1237, p90=1.6341) (impact=0.0037)
  - A2: dispersion_grupo_04376__NINGUNO ratio=604.8x (impact=0.0250)
  - A3: ratio_prod_logistico=0.08x (vol_log=0.1200, vol_calc=1.4479) (impact=1.3279)
  - A4: vol_repetido_disparate=0.1200 (27 prods, 7 cats) (impact=0.0000)
  - A6: rango_esperado_ARMARIO vol=0.1200 < min=0.4 (impact=0.2800)

---
## AUDIT 10 — Estadísticas Globales

### Distribución de flags por auditoría

| Auditoría | Flags emitidos | % sobre total con vol |
|-----------|---------------|----------------------|
| Audit 1 | 2,845 | 19.9% |
| Audit 2 | 12,021 | 83.9% |
| Audit 3 | 699 | 4.9% |
| Audit 4 | 4,228 | 29.5% |
| Audit 5 | 1,411 | 9.9% |
| Audit 6 | 819 | 5.7% |
| Audit 7 | 996 | 7.0% |
| Audit 8 | 864 | 6.0% |

### Total de productos únicos con ≥1 flag

**13,405 productos** con al menos 1 flag (93.6% del total con vol_logistico).

### Categorías con peor fiabilidad (>20% flagados)

| Categoría | % Flagados | N Total | N Flagados |
|-----------|-----------|---------|------------|
| MENAJE | 100.0% | 367 | 367 |
| ESPEJO | 100.0% | 176 | 176 |
| COMODA | 100.0% | 151 | 151 |
| LAMPARA | 100.0% | 161 | 161 |
| TEXTIL | 100.0% | 125 | 125 |
| EXTERIOR | 100.0% | 30 | 30 |
| CALEFACCION | 100.0% | 155 | 155 |
| AUDIO | 100.0% | 34 | 34 |
| FRIGO | 100.0% | 403 | 403 |
| LITERA | 100.0% | 22 | 22 |
| ALFOMBRA | 100.0% | 68 | 68 |
| DECORACION | 100.0% | 139 | 139 |
| MOVIL | 100.0% | 294 | 294 |
| TV | 100.0% | 282 | 282 |
| PEQ_ELECTRO | 99.6% | 268 | 267 |
| RECIBIDOR | 99.6% | 232 | 231 |
| CAMPANA | 99.4% | 158 | 157 |
| MICROONDAS | 99.3% | 138 | 137 |
| CLIMA | 98.7% | 238 | 235 |
| MESITA | 98.5% | 195 | 192 |
| HORNO_PLACA | 98.3% | 292 | 287 |
| ARMARIO | 97.7% | 307 | 300 |
| CABECERO | 97.4% | 192 | 187 |
| LAVADORA | 97.4% | 343 | 334 |
| OTRO | 96.4% | 4,563 | 4,397 |
| LAVAVAJILLAS | 96.2% | 156 | 150 |
| CAMA | 96.0% | 302 | 290 |
| LIBRERIA | 95.6% | 206 | 197 |
| MUEBLE_TV | 95.5% | 178 | 170 |
| ASPIRADOR | 93.9% | 33 | 31 |
| COLCHON | 93.8% | 469 | 440 |
| CUADRO | 93.7% | 126 | 118 |
| VITRINA | 92.6% | 122 | 113 |
| MESA_COMEDOR | 91.3% | 183 | 167 |
| MESA_CENTRO | 90.5% | 359 | 325 |
| MESA_ESCRITORIO | 89.8% | 127 | 114 |
| APARADOR | 89.5% | 209 | 187 |
| SILLA | 84.6% | 1,468 | 1,242 |
| COMPOSICION | 80.9% | 110 | 89 |
| SOFA_CAMA | 73.6% | 121 | 89 |
| SOFA_GRANDE | 67.1% | 821 | 551 |

### Estimación de impacto en volumen total

| Métrica | Valor |
|---------|-------|
| Vol total actual | 5617.79 m³ |
| Vol de productos con ≥1 flag | 4769.22 m³ (84.9% del total) |
| Vol potencial en riesgo (audit6+8) | 657.55 m³ |

---
## FIXES PROPUESTOS PRIORIZADOS

Basados en los hallazgos de las 10 auditorías. Ordenados por prioridad.

### Prioridad ALTA

#### Fix9 — Cap electros fuera de rango físico esperado
- **Descripción**: Productos de categorías con rangos bien conocidos (lavadora, frigo, TV, microondas, etc.) cuyo vol_logistico está fuera del rango esperado → clampar al límite o invalidar. Aplica capa ratio/promedio, no a ERP (capa 1).
- **Productos afectados estimados**: ~819
- **Impacto en volumen estimado**: ~54.67 m³
- **Prioridad**: ALTA

#### Fix10 — Invalidar respuestas Gemini donde ratio_embalaje/producto < 1.2
- **Descripción**: Para estimación gemini_embalaje: si vol_logistico / vol_producto < 1.2 → el embalaje probablemente es igual al producto (Gemini devolvió dims del producto). Invalidar y recalcular con ratio_subfamilia como fallback.
- **Productos afectados estimados**: ~996
- **Impacto en volumen estimado**: ~58.92 m³
- **Prioridad**: ALTA

#### Fix11 — Invalidar vol_logistico cuando ratio paquete/producto > 12x
- **Descripción**: Productos donde vol_logistico > 12 × vol_producto son físicamente imposibles (excluidas categorías planas/enrollables). Recalcular con promedio_subfamilia.
- **Productos afectados estimados**: ~833
- **Impacto en volumen estimado**: ~324.17 m³
- **Prioridad**: ALTA

#### Fix12 — Invalidar vol_logistico cuando ratio paquete/producto < 0.05x
- **Descripción**: Productos donde vol_logistico < 5% del vol_producto son imposibles (el embalaje no puede ser más pequeño que el producto). Recalcular con ratio_subfamilia.
- **Productos afectados estimados**: ~31
- **Impacto en volumen estimado**: ~207.96 m³
- **Prioridad**: ALTA

### Prioridad MEDIA

#### Fix13 — Normalizar series con dispersión extrema (ratio max/min > 50x)
- **Descripción**: Grupos de productos de la misma serie/programa con dispersión > 50x son sospechosos. Revisar manualmente y normalizar outliers al rango intercuartil del grupo.
- **Productos afectados estimados**: ~10,474
- **Impacto en volumen estimado**: ~64.23 m³
- **Prioridad**: MEDIA

#### Fix14 — Revisar TVs fuera de rango [0.03, 0.80] m³
- **Descripción**: Televisores cuyo vol_logistico está fuera del rango esperado 0.03-0.80 m³. TVs muy grandes (>80") pueden superar 0.80, ajustar rango superior. TVs muy pequeños (<0.03) son probablemente tablets o monitores.
- **Productos afectados estimados**: ~22
- **Impacto en volumen estimado**: ~3.19 m³
- **Prioridad**: MEDIA

### Prioridad BAJA

#### Fix15 — Revisar colchones fuera de rango [0.08, 0.90] m³
- **Descripción**: Colchones cuyo vol_logistico está fuera del rango. Los de memory foam se pueden envacar en vacío a <0.08m³, pero colchones de muelles no. Los >0.90 son probablemente conjuntos cama+colchón. Estratificar por tipo de colchón.
- **Productos afectados estimados**: ~55
- **Impacto en volumen estimado**: ~7.76 m³
- **Prioridad**: BAJA

---
### Tabla resumen de fixes

| ID | Nombre | Productos | Vol Impact (m³) | Prioridad |
|----|--------|-----------|-----------------|-----------|
| Fix9 | Cap electros fuera de rango físico esperado | ~819 | ~54.67 | ALTA |
| Fix10 | Invalidar respuestas Gemini donde ratio_embalaje/producto <  | ~996 | ~58.92 | ALTA |
| Fix11 | Invalidar vol_logistico cuando ratio paquete/producto > 12x | ~833 | ~324.17 | ALTA |
| Fix12 | Invalidar vol_logistico cuando ratio paquete/producto < 0.05 | ~31 | ~207.96 | ALTA |
| Fix13 | Normalizar series con dispersión extrema (ratio max/min > 50 | ~10,474 | ~64.23 | MEDIA |
| Fix14 | Revisar TVs fuera de rango [0.03, 0.80] m³ | ~22 | ~3.19 | MEDIA |
| Fix15 | Revisar colchones fuera de rango [0.08, 0.90] m³ | ~55 | ~7.76 | BAJA |

---
*Generado automáticamente por audit_medidator.py*