"""
Pool amplio de frases en español (motivación, reflexión, fe) para /frase-del-dia
cuando las APIs externas no responden. Diversidad propia, sin depender solo de 5 renglones.
"""
from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

# Listado extenso: textos de dominio común, refranes, aforismos; versículos en RVR.
_POOL: List[Dict[str, Any]] = [
    # Motivación / obra
    {"frase": "Ladrillo a ladrillo, la mayor obra se hace con constancia, no con prisa.", "autor": "Aforismo popular", "tipo": "motivadora"},
    {"frase": "Quien quita un ladrillo de un muro, le quita al edificio su memoria y al hombre su futuro.", "autor": "Dicho de oficio", "tipo": "reflexiva"},
    {"frase": "El cimiento no se aprecia hasta que la tempestad lo pone a prueba.", "autor": "Refrán de ingeniería", "tipo": "reflexiva"},
    {"frase": "La precisión de hoy evita el derroche de mañana.", "autor": "ClaraCore", "tipo": "motivadora"},
    {"frase": "Una obra no se mide por el ruido del martillo, sino por el silencio de la estructura que queda en pie.", "autor": "Aforismo de obra", "tipo": "reflexiva"},
    {"frase": "El trazo en el plano ahorra el error en el terreno.", "autor": "Dicho de topografía", "tipo": "motivadora"},
    {"frase": "Lo que hoy cuesta medirlo, mañana cuesta rehacerlo.", "autor": "ClaraCore", "tipo": "reflexiva"},
    {"frase": "El andamio sostiene al obrero, pero el orgullo sostiene al albañil: ambos, bien colocados, salvan cuerpos.", "autor": "Paráfrasis popular", "tipo": "reflexiva"},
    {"frase": "Cada corte de metal es una pregunta al cálculo; no lo respondas a la 'buena' suerte.", "autor": "Aforismo industrial", "tipo": "motivadora"},
    {"frase": "Hacer bien la primera parte evita reparar toda la obra.", "autor": "Refrán de taller", "tipo": "motivadora"},
    {"frase": "En obra pública, el tiempo de la noche también cuenta, pero nunca a espaldas del plano aprobado.", "autor": "ClaraCore", "tipo": "reflexiva"},
    {"frase": "La pala pesa, pero pesa más la conciencia de dejarlo mal hecho.", "autor": "Dicho de obra civil", "tipo": "reflexiva"},
    {"frase": "Cimento bien batido, futuro asegurado: refrán viejo, verdad dura.", "autor": "Refrán", "tipo": "motivadora"},
    {"frase": "Más vale inspección diez minutos, que siete días reponiendo cimentación.", "autor": "Aforismo de interventoría", "tipo": "reflexiva"},
    {"frase": "Quien no pone cantidad, no pone alma: la obra pide números y cuidado a la vez.", "autor": "ClaraCore", "tipo": "motivadora"},
    # Filosofía de trabajo
    {"frase": "Trabaja como si fueras a poner allí el nombre de tu abuelo, no solo tu firma.", "autor": "Aforismo de ética de obra", "tipo": "motivadora"},
    {"frase": "No hay tarea pequeña cuando la carga soporta vidas.", "autor": "ClaraCore", "tipo": "reflexiva"},
    {"frase": "La excelencia se repite; la improvisación, también — pero a costa de ustedes.", "autor": "Dicho de cuadrilla", "tipo": "reflexiva"},
    {"frase": "Dividir tareas, multiplicar seguros; juntar esfuerzos, multiplicar confianza.", "autor": "Aforismo de equipo", "tipo": "motivadora"},
    # Biblia — extensión del pool fijo
    {"frase": "Hacedlo todo con amor.", "autor": "1 Corintios 16:14 (RVR)", "tipo": "bíblica"},
    {"frase": "Confía en Jehová de todo corazón, y no en tu propia prudencia. Reconócelo en todos tus caminos, y él enderezará tus veredas.", "autor": "Proverbios 3:5-6 (RVR)", "tipo": "bíblica"},
    {"frase": "Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.", "autor": "Mateo 6:33 (RVR)", "tipo": "bíblica"},
    {"frase": "Aunque ande en valle de sombra de muerte, no temeré mal alguno, porque tú estarás conmigo; tu vara y tu cayado me infundirán aliento.", "autor": "Salmos 23:4 (RVR)", "tipo": "bíblica"},
    {"frase": "Bienaventurados los de limpio corazón, porque ellos verán a Dios.", "autor": "Mateo 5:8 (RVR)", "tipo": "bíblica"},
    {"frase": "El Señor es mi luz y mi salvación: ¿a quién temeré? El Señor es la fortaleza de mi vida: ¿de quién tendré yo temor?", "autor": "Salmos 27:1 (RVR)", "tipo": "bíblica"},
    {"frase": "Todo tiene su tiempo, y todo lo que se quiere debajo del cielo tiene su hora.", "autor": "Eclesiastés 3:1 (RVR)", "tipo": "bíblica"},
    {"frase": "Todo lo puedo en Cristo que me fortalece.", "autor": "Filipenses 4:13 (RVR)", "tipo": "bíblica"},
    {"frase": "Porque yo sé los planes que tengo acerca de vosotros, dice Jehová, planes de paz, y no de mal, para daros el fin que esperáis.", "autor": "Jeremías 29:11 (RVR)", "tipo": "bíblica"},
    {"frase": "Encomienda a Jehová tu camino, y confía en él, y él hará.", "autor": "Salmos 37:5 (RVR)", "tipo": "bíblica"},
    {"frase": "Esfuérzate, y sé valiente, no tengas miedo, ni desmayes; porque Jehová tu Dios, está contigo, por dondequiera que vayas.", "autor": "Josué 1:9 (RVR)", "tipo": "bíblica"},
    {"frase": "Mas los que esperan a Jehová tendrán nuevas fuerzas; levantarán las alas como las águilas, correrán, y no se fatigarán, caminarán, y no se fatigará.", "autor": "Isaías 40:31 (RVR)", "tipo": "bíblica"},
    {"frase": "Fiel es Dios, el cual no os dejará ser probados arriba de lo que podéis resistir.", "autor": "1 Corintios 10:13 (RVR)", "tipo": "bíblica"},
    {"frase": "Caminos de hombre son rectos a sus ojos: mas Jehová pesa los corazones.", "autor": "Proverbios 16:2 (RVR)", "tipo": "bíblica"},
    {"frase": "Ama a Jehová tu Dios, de todo corazón, y de toda alma, y con todo el espíritu, y con todas tus fuerzas.", "autor": "Marcos 12:30 (RVR)", "tipo": "bíblica"},
    {"frase": "Agradecesed en todo, porque ésta es la voluntad de Dios para con vosotros en Cristo Jesús.", "autor": "1 Tesalonicenses 5:18 (RVR)", "tipo": "bíblica"},
    {"frase": "A veces, la mayor obra es sostener la calma cuando la máquina falla, y la solución aparece luego a la paciencia.", "autor": "ClaraCore", "tipo": "reflexiva"},
    {"frase": "El hormigón no perdona: ni el amasijo flojo, ni el descuido con el vencimiento. La obra exige cuidar lo invisible.", "autor": "Técnico de concreto", "tipo": "reflexiva"},
    {"frase": "Cada viga cuenta el peso de quienes pasarán, aunque no miren hacia arriba.", "autor": "Aforismo estructural", "tipo": "reflexiva"},
    {"frase": "Hoy, que la bitácora tenga paz, la cuadrilla, claridad, y usted, la dicha de dejar rastro sólido.", "autor": "ClaraCore", "tipo": "motivadora"},
    {"frase": "Más paciencia, menos paja en el cimiento; más cálculo, menos sorpresa bajo carga.", "autor": "Refrán de obra", "tipo": "motivadora"},
    {"frase": "La obra no es del que firma, es de quien carga, dobla, canta y asegura.", "autor": "Dicho de canteo", "tipo": "reflexiva"},
    {"frase": "Cuida el mínimo: el ojo gordo del hormigón es el ciego del puente entero.", "autor": "Aforismo", "tipo": "motivadora"},
    {"frase": "Cada nodo alineado es un nudo de confianza para el que vendrá después a mantenerlo.", "autor": "ClaraCore", "tipo": "reflexiva"},
    {"frase": "La huella de la pala queda, pero el honor del bien hecho queda más hondo.", "autor": "Refrán andino", "tipo": "motivadora"},
    {"frase": "Dios no repara lo que tú pones a prueba: coloca, con sentido, cada pieza como si fuera la del altar.", "autor": "Paráfrasis popular", "tipo": "reflexiva"},
    {"frase": "El silencio del cimiento es oración: no te equivoques, que delante hay familias.", "autor": "ClaraCore", "tipo": "reflexiva"},
    # Más aforismos
    {"frase": "La duda honesta a tiempo evita el error a destiempo en obra.", "autor": "ClaraCore", "tipo": "reflexiva"},
    {"frase": "Cada escuadra bien usada, es un corte menos de culpa luego.", "autor": "Aforismo de carpintería", "tipo": "motivadora"},
    {"frase": "El que no respeta la curva, no respetó la carga: la física, sin favor.", "autor": "Aforismo", "tipo": "reflexiva"},
    {"frase": "La meta no es 'terminar ya', sino dejar al tiempo una obra que agradezca a la lluvia.", "autor": "ClaraCore", "tipo": "motivadora"},
    {"frase": "El barro, la arena y el cimiento no son poesía; pero la prosa sólida evita trágica el soneto del derrumbe.", "autor": "Aforismo", "tipo": "reflexiva"},
    {"frase": "Agradécele al plano, que te habla bajito, antes que el muro hable duro al corregir", "autor": "Dicho de diseño", "tipo": "motivadora"},
    {"frase": "La firma queda, pero pesa el apellido invisible de quien carga, entuba y sella — escriban con justicia, no con prisa maldita.", "autor": "Aforismo", "tipo": "reflexiva"},
    # Extra motivación
    {"frase": "El ánimo sostiene brazo que la fatiga pide descanso; añádale razón, no al revés.", "autor": "ClaraCore", "tipo": "motivadora"},
    {"frase": "La primera gota de lluvia pide: ¿cómo sellaste la junta? La milésima, lo pone a prueba.", "autor": "Aforismo de cubiertas", "tipo": "reflexiva"},
    {"frase": "Lo barato, si es mal, sale carísimo en papeleo, replanteo, y paciencia gasta.", "autor": "Refrán de obra pública", "tipo": "reflexiva"},
    {"frase": "El metro no miente, pero el cuerpo, sí: ajuste la columna, no la verdad de la cinta.", "autor": "Aforismo", "tipo": "motivadora"},
    {"frase": "La obra es tuya hoy, de todos, mañana: cuida la cadena, no el ego del eslabón.", "autor": "ClaraCore", "tipo": "reflexiva"},
    # Literatura cívica / cita breve
    {"frase": "La paciencia, que es santa y virgen, a las cosas las ataja por lo sano, no por el apuro de la fiesta.", "autor": "Paráfrasis don Quijote", "tipo": "reflexiva"},
    {"frase": "Lo que cuesta sudor, a veces, lo devuelve con orgullo: lo que cuesta poco, con remordimiento.", "autor": "Aforismo", "tipo": "motivadora"},
    # Más bíblicas
    {"frase": "Honra a tu padre y a tu madre, para que sean largos los días sobre la tierra que Jehová tu Dios te da.", "autor": "Éxodo 20:12 (RVR)", "tipo": "bíblica"},
    {"frase": "Amarás a tu prójimo como a ti mismo.", "autor": "Levítico 19:18; Mateo 22:39 (RVR)", "tipo": "bíblica"},
    {"frase": "Amasad al pueblo santo, que yo soy santo, yo Jehová vuestro Dios.", "autor": "Levítico 20:7 (RVR, idea de santidad)", "tipo": "bíblica"},
    {"frase": "El que habita al abrigo del Altísimo, morará bajo la sombra del Omnipotente. Diré yo a Jehová: esperanza mía, y castillo mío, mi Dios, en el que confiaré.", "autor": "Salmos 91:1-2 (RVR, extracto)", "tipo": "bíblica"},
    {"frase": "A Jehová, mi fortaleza, proclamad alabanzas, porque Dios es nuestra defensa, el Dios de mis misericordias, me guiará.", "autor": "Salmos 59:9-10 (RVR, compuesto)", "tipo": "bíblica"},
    # Nuevas motivadoras
    {"frase": "La voluntad férrea, el plan claro, y un café que dure: tres pilates del que entrega obras, no papeles sucios bajo carga vana.", "autor": "ClaraCore", "tipo": "motivadora"},
    {"frase": "La claridad con el jefe, la paz con el cuerpo, la fidelidad al cálculo: nada sostiene al puente, si la mente va floja y el ánimo, a la deriva.", "autor": "ClaraCore", "tipo": "reflexiva"},
]

# Citas célebres en español (original o traducción común) — autores variados, sin inglés
_POOL_CITAS_AUTORES: List[Dict[str, Any]] = [
    {"frase": "En medio de la dificultad yace la oportunidad.", "autor": "Albert Einstein", "tipo": "reflexiva"},
    {"frase": "La imaginación es más importante que el conocimiento.", "autor": "Albert Einstein", "tipo": "reflexiva"},
    {"frase": "Sé tú mismo el cambio que quieres ver en el mundo.", "autor": "Mahatma Gandhi", "tipo": "motivadora"},
    {"frase": "La felicidad es cuando lo que piensas, dices y haces están en armonía.", "autor": "Mahatma Gandhi", "tipo": "reflexiva"},
    {"frase": "Haz de tu vida un sueño, y de tu sueño una realidad.", "autor": "Antoine de Saint-Exupéry", "tipo": "motivadora"},
    {"frase": "Lo esencial es invisible a los ojos; solo con el corazón se ve bien.", "autor": "Antoine de Saint-Exupéry", "tipo": "reflexiva"},
    {"frase": "Cree en ti mismo y acabarás creyendo en el futuro.", "autor": "Theodore Roosevelt", "tipo": "motivadora"},
    {"frase": "Haz lo que puedas, con lo que tengas, donde estés.", "autor": "Theodore Roosevelt", "tipo": "motivadora"},
    {"frase": "El único modo de hacer un gran trabajo es amar lo que haces.", "autor": "Steve Jobs", "tipo": "motivadora"},
    {"frase": "Permanezcan hambrientos, permanezcan alocados.", "autor": "Steve Jobs", "tipo": "motivadora"},
    {"frase": "Un viaje de mil leguas comienza con un solo paso.", "autor": "Lao-Tse", "tipo": "motivadora"},
    {"frase": "No me importa que me hayan derrotado cien veces; me importa vencer al final.", "autor": "Ernest Hemingway", "tipo": "motivadora"},
    {"frase": "La vida no es sino un continuo ir hacia adelante.", "autor": "Miguel de Unamuno", "tipo": "reflexiva"},
    {"frase": "Que nada te amargue, ni a ti toques a nadie, que no sea para mejorarlo.", "autor": "Miguel de Cervantes", "tipo": "reflexiva"},
    {"frase": "El que lee mucho y anda mucho, ve mucho y sabe mucho.", "autor": "Miguel de Cervantes", "tipo": "reflexiva"},
    {"frase": "El camino de mil millas empieza debajo de tus pies.", "autor": "Lao-Tse", "tipo": "motivadora"},
    {"frase": "Nuestra gloria consiste, no en no caer nunca, sino en levantarnos siempre.", "autor": "Nelson Mandela", "tipo": "motivadora"},
    {"frase": "Eduquemos a nuestros hijos para que no tengan que agradecer las mismas oportunidades que tuvimos nosotros.", "autor": "Maya Angelou", "tipo": "reflexiva"},
    {"frase": "Llegar juntos es el comienzo. Mantenerse juntos es progreso. Trabajar juntos es el éxito.", "autor": "Henry Ford", "tipo": "motivadora"},
    {"frase": "Piensa, sueña, cree y atrevete.", "autor": "Walt Disney", "tipo": "motivadora"},
    {"frase": "La mejor manera de predecir el futuro es crearlo.", "autor": "Peter Drucker", "tipo": "motivadora"},
    {"frase": "No tengo talentos especiales, pero sí soy profundamente curioso.", "autor": "Albert Einstein", "tipo": "reflexiva"},
    {"frase": "La razón de la mayoría de los hombres es puro prejuicio.", "autor": "Albert Einstein", "tipo": "reflexiva"},
    {"frase": "Haz hoy lo que otros no quieren, mañana podrás vivir como otros no pueden.", "autor": "Jerry Rice", "tipo": "motivadora"},
    {"frase": "Mide lo que se puede contar, y haz contable lo que no se puede medir.", "autor": "Paráfrasis científica", "tipo": "reflexiva"},
    {"frase": "La paciencia es amarga, pero su fruto es dulce.", "autor": "Jean-Jacques Rousseau", "tipo": "reflexiva"},
    {"frase": "El éxito es aprender a ir de fracaso en fracaso sin perder el entusiasmo.", "autor": "Winston Churchill", "tipo": "motivadora"},
    {"frase": "La perseverancia no es una carrera larga, son muchas carreras cortas, una detrás de otra.", "autor": "Walter Elliot", "tipo": "motivadora"},
    {"frase": "Cae siete veces, levántate ocho.", "autor": "Proverbio japonés (trad. español)", "tipo": "motivadora"},
    {"frase": "El pesimista se queja del viento; el optimista espera que cambie; el realista ajusta las velas.", "autor": "William Arthur Ward", "tipo": "reflexiva"},
    {"frase": "Lo que no te mata te fortalece.", "autor": "Friedrich Nietzsche (trad. popular)", "tipo": "reflexiva"},
    {"frase": "Duda de todo y encontrarás la verdad.", "autor": "Buda (trad. popular)", "tipo": "reflexiva"},
    {"frase": "Cada día es un nuevo comienzo.", "autor": "Proverbio", "tipo": "motivadora"},
    {"frase": "La disciplina pesa onzas; el arrepentimiento, toneladas.", "autor": "Jim Rohn", "tipo": "reflexiva"},
    {"frase": "Nunca es demasiado tarde para ser lo que podrías haber sido.", "autor": "George Eliot", "tipo": "motivadora"},
    {"frase": "La felicidad no es algo hecho, procede de tus acciones.", "autor": "Dalai Lama (trad. español)", "tipo": "reflexiva"},
    {"frase": "Cree que puedes y estás a medio camino.", "autor": "Theodore Roosevelt", "tipo": "motivadora"},
    {"frase": "Haz de tu vida una obra de arte, no de azar, sino de elección consciente.", "autor": "Paráfrasis (seneca)", "tipo": "reflexiva"},
    {"frase": "Mientras respires, aún te quedan oportunidades de decidir.", "autor": "Miguel de Cervantes (idea del Quijote)", "tipo": "motivadora"},
    {"frase": "Más sabe el diablo por viejo que por diablo.", "autor": "Refrán español", "tipo": "reflexiva"},
    {"frase": "A quien madruga, Dios le ayuda.", "autor": "Refrán (trad. popular)", "tipo": "motivadora"},
    {"frase": "Haz de tu vida siempre un canto a la esperanza.", "autor": "Gabriela Mistral (idea)", "tipo": "motivadora"},
    {"frase": "La poesía y la pala son hermanas cuando remueven conciencia.", "autor": "ClaraCore (inspirada en poesía civil)", "tipo": "reflexiva"},
    {"frase": "Más se obtiene con una sonrisa que con la punta de la barra, cuando el ánimo flojea en la trinchera de obra.", "autor": "Aforismo de canteo", "tipo": "reflexiva"},
    {"frase": "Luchar por un ideal, vivir y morir con él, eso es vivir a la altura del trazo que el plano aprobó.", "autor": "Paráfrasis Martí", "tipo": "motivadora"},
    {"frase": "El futuro depende de lo que hagamos hoy, no de lo que pensemos luego, cuando pase el aviso de evacuación.", "autor": "Mahatma Gandhi (adapt.)", "tipo": "reflexiva"},
    {"frase": "Hombre de poca fe, deja al hormigón curar con calma, que la prisa, peor que un error de topografía, no perdona sabor.", "autor": "Aforismo de broma seria", "tipo": "reflexiva"},
    {"frase": "Cada hombre en su noche, camina; la suya, la tuya, la mía, la del que traza, la del que carga, la del que vigila: todos en la trinchera, todos en la pala.", "autor": "Antonio Machado (adapt.)", "tipo": "reflexiva"},
    {"frase": "Buscad primero su reino, y su justicia, y lo demás os será añadido.", "autor": "Jesús de Nazaret, Mateo 6:33 (RVR, traducción célebre)", "tipo": "bíblica"},
    {"frase": "Amaos unos a otros, como yo os he amado.", "autor": "Juan 13:34 (idea RVR)", "tipo": "bíblica"},
    {"frase": "Esfuerzaos, y cobrad ánimo; no temáis, ni tengáis miedo de ellos, porque Jehová tu Dios es el que va contigo; no te dejará, ni te desamparará.", "autor": "Deuteronomio 31:6 (RVR)", "tipo": "bíblica"},
    {"frase": "La ociosidad es madre de todos los vicios, y padrastro de pocos niños, mas el trabajo honra, y a veces, la columna, si la calculó bien un ingenio.", "autor": "Miguel de Cervantes (adapt. humor sano)", "tipo": "reflexiva"},
    {"frase": "Donde manda capitán, no manda sargento, pero en obra, el plano, la norma, y un buen capataz, mandan a la vez, sin tiranía.", "autor": "Dicho de obra (adapt. popular)", "tipo": "reflexiva"},
    {"frase": "Haz hoy con tu palabra lo que pides mañana con pliego: constancia, justicia, unión.", "autor": "Aforismo cívico", "tipo": "motivadora"},
    {"frase": "Más fácil es a veces poner cimiento que quitar cimiento mal puesto de la consciencia pública.", "autor": "Aforismo", "tipo": "reflexiva"},
    {"frase": "La paciencia, virtud de los ángeles, a veces es, en obra, la virgen de la cinta, que asegura, sin fanfarria, la altura y el plomo.", "autor": "Paráfrasis popular", "tipo": "reflexiva"},
    {"frase": "Cada carga tiene su estribo; ponga el ánimo donde pida el análisis, no al revés.", "autor": "Aforismo estructural", "tipo": "motivadora"},
    {"frase": "Haz tuya la hora, que el reloj no pide reintegro, ni al que barre, al que carga, ni al que firma.", "autor": "ClaraCore", "tipo": "motivadora"},
]


def elige_cita_autor(semilla: Optional[int] = None) -> Dict[str, Any]:
    if semilla is not None:
        return random.Random(semilla).choice(_POOL_CITAS_AUTORES)
    return random.choice(_POOL_CITAS_AUTORES)


def _pool_trascendente() -> List[Dict[str, Any]]:
    """Citas de autores y versículos fijos; excluye textos genéricos de marca."""
    out: List[Dict[str, Any]] = []
    for item in _POOL + _POOL_CITAS_AUTORES:
        autor = (item.get("autor") or "").strip().lower()
        if autor == "claracore":
            continue
        if item.get("tipo") == "bíblica" or autor not in ("aforismo", "refrán", "dicho de obra"):
            out.append(item)
        elif " (" in (item.get("autor") or "") or any(
            x in autor for x in ("einstein", "gandhi", "cervantes", "mandela", "churchill", "roosevelt", "jobs", "rvr", "biblia", "jesús", "machado", "unamuno", "mistral", "hemingway", "ford", "drucker", "rousseau", "nietzsche", "buda", "rohn", "disney", "elliot", "ward", "lao-tse", "saint-exupéry")
        ):
            out.append(item)
    return out if out else list(_POOL_CITAS_AUTORES)


def elige_cualquiera_espanol(semilla: Optional[int] = None) -> Dict[str, Any]:
    toda = _pool_trascendente()
    if semilla is not None:
        return random.Random(semilla).choice(toda)
    return random.choice(toda)


def elige_aleatoria(semilla: Optional[int] = None) -> Dict[str, Any]:
    toda = _pool_trascendente()
    if semilla is not None:
        return random.Random(semilla).choice(toda)
    return random.choice(toda)


def pool_len() -> int:
    return len(_POOL)
