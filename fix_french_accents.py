#!/usr/bin/env python3
"""Fix French diacritics in nudge_* entries of Localizable.strings.
Only modifies lines whose key starts with "nudge_"."""
import re
import sys

filepath = '/Users/cbns03/Downloads/anicca-project/aniccaios/aniccaios/Resources/fr.lproj/Localizable.strings'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
fixed_count = 0
fixed_lines = []

# Word-boundary replacements: (pattern, replacement)
# Applied in order, longer patterns first to avoid partial matches
# Each is a tuple: (unaccented, accented)
WORD_REPLACEMENTS = [
    # Multi-word / hyphenated phrases FIRST
    ('peut-etre', 'peut-être'),
    ('toi-meme', 'toi-même'),
    ('lui-meme', 'lui-même'),
    ('elle-meme', 'elle-même'),
    ('eux-memes', 'eux-mêmes'),
    ('soi-meme', 'soi-même'),
    ("chef-d'oeuvre", "chef-d'œuvre"),
    ("jusqu'a", "jusqu'à"),

    # Long words (6+ chars) - safe, unambiguous
    ('ameliorera', 'améliorera'),
    ('ameliorer', 'améliorer'),
    ('ameliore', 'améliore'),
    ('anesthesiante', 'anesthésiante'),
    ('anesthesie', 'anesthésie'),
    ('anxiete', 'anxiété'),
    ('arreter', 'arrêter'),
    ('barriere', 'barrière'),
    ('commercant', 'commerçant'),
    ('concretisent', 'concrétisent'),
    ('controler', 'contrôler'),
    ('controles', 'contrôles'),
    ('credibilite', 'crédibilité'),
    ('culpabilite', 'culpabilité'),
    ('deuxieme', 'deuxième'),
    ('decisions', 'décisions'),
    ('decouvert', 'découvert'),
    ('deguisee', 'déguisée'),
    ('derriere', 'derrière'),
    ('desirer', 'désirer'),
    ('detester', 'détester'),
    ('differente', 'différente'),
    ('differents', 'différents'),
    ('different', 'différent'),
    ('difficulte', 'difficulté'),
    ('disparaitra', 'disparaîtra'),
    ('disparait', 'disparaît'),
    ('ecoutaient', 'écoutaient'),
    ('ecoutent', 'écoutent'),
    ('emotionnel', 'émotionnel'),
    ('emotions', 'émotions'),
    ('emotion', 'émotion'),
    ('energie', 'énergie'),
    ('epaules', 'épaules'),
    ('epuisante', 'épuisante'),
    ('esperant', 'espérant'),
    ('etaient', 'étaient'),
    ('eternite', 'éternité'),
    ('etudes', 'études'),
    ('evasion', 'évasion'),
    ('evenements', 'événements'),
    ('eveillee', 'éveillée'),
    ('eveille', 'éveillé'),
    ('exterieur', 'extérieur'),
    ('guerison', 'guérison'),
    ('honnetement', 'honnêtement'),
    ('honnetete', 'honnêteté'),
    ('honnete', 'honnête'),
    ('immunite', 'immunité'),
    ('inacheve', 'inachevé'),
    ('inquieter', 'inquiéter'),
    ('inquietudes', 'inquiétudes'),
    ('inquiete', 'inquiète'),
    ('insecurite', 'insécurité'),
    ('integrite', 'intégrité'),
    ('interieure', 'intérieure'),
    ('interets', 'intérêts'),
    ('irreparable', 'irréparable'),
    ('journees', 'journées'),
    ('journee', 'journée'),
    ('legalement', 'légalement'),
    ('lineaire', 'linéaire'),
    ('luminosite', 'luminosité'),
    ('medicament', 'médicament'),
    ('mediocre', 'médiocre'),
    ('meditation', 'méditation'),
    ('meditais', 'méditais'),
    ('medisance', 'médisance'),
    ('memoire', 'mémoire'),
    ('meritent', 'méritent'),
    ('merites', 'mérites'),
    ('necessaire', 'nécessaire'),
    ('necessite', 'nécessite'),
    ('negativement', 'négativement'),
    ('pensees', 'pensées'),
    ('pensee', 'pensée'),
    ('piege', 'piège'),
    ('premiere', 'première'),
    ('premieres', 'premières'),
    ('preparation', 'préparation'),
    ('presence', 'présence'),
    ('present', 'présent'),
    ('prevue', 'prévue'),
    ('problemes', 'problèmes'),
    ('probleme', 'problème'),
    ('productivite', 'productivité'),
    ('progres', 'progrès'),
    ('protegerais', 'protégerais'),
    ('proteger', 'protéger'),
    ('qualites', 'qualités'),
    ('qualite', 'qualité'),
    ('quantite', 'quantité'),
    ('realite', 'réalité'),
    ('recemment', 'récemment'),
    ('reconsidere', 'reconsidère'),
    ('reellement', 'réellement'),
    ('reflechir', 'réfléchir'),
    ('reflechis', 'réfléchis'),
    ('reflete', 'reflète'),
    ('reinitialise', 'réinitialise'),
    ('repondre', 'répondre'),
    ('reponses', 'réponses'),
    ('reputation', 'réputation'),
    ('resoudre', 'résoudre'),
    ('resoudra', 'résoudra'),
    ('resout', 'résout'),
    ('resolu', 'résolu'),
    ('reussites', 'réussites'),
    ('reveille', 'réveillé'),
    ('reveil', 'réveil'),
    ('routinieres', 'routinières'),
    ('schema', 'schéma'),
    ('securite', 'sécurité'),
    ('societe', 'société'),
    ('superiorite', 'supériorité'),
    ('survecu', 'survécu'),
    ('systeme', 'système'),
    ('telephone', 'téléphone'),
    ('temperature', 'température'),
    ('verification', 'vérification'),
    ('verite', 'vérité'),
    ('verifie', 'vérifié'),

    # Medium words (4-5 chars)
    ('annees', 'années'),
    ('blamer', 'blâmer'),
    ('colere', 'colère'),
    ('coutent', 'coûtent'),
    ('creant', 'créant'),
    ('degout', 'dégoût'),
    ('degats', 'dégâts'),
    ('deteste', 'déteste'),
    ('detail', 'détail'),
    ('details', 'détails'),
    ('durete', 'dureté'),
    ('enorme', 'énorme'),
    ('erode', 'érode'),
    ('foret', 'forêt'),
    ('legere', 'légère'),
    ('leger', 'léger'),
    ('libere', 'libère'),
    ('liberte', 'liberté'),
    ('lumiere', 'lumière'),
    ('menent', 'mènent'),
    ('meteo', 'météo'),
    ('obsede', 'obsède'),
    ('piece', 'pièce'),
    ('ramene', 'ramène'),
    ('reagir', 'réagir'),
    ('reduire', 'réduire'),
    ('sincere', 'sincère'),
    ('controle', 'contrôle'),

    # Short but safe words (very specific French words)
    ('deja', 'déjà'),
    ('echec', 'échec'),
    ('ecran', 'écran'),
    ('elan', 'élan'),
    ('epuise', 'épuisé'),
    ('meme', 'même'),
    ('pret', 'prêt'),
    ('tete', 'tête'),
    ('coeur', 'cœur'),
    ('ancre', 'ancré'),

    # Words needing â
    ('lache', 'lâche'),

    # Short words - past participles / adjectives (context usually clear)
    ('brisee', 'brisée'),
    ('definit', 'définit'),
    ('essaye', 'essayé'),
    ('eteint', 'éteint'),
    ('frustre', 'frustré'),
    ('gagnes', 'gagnés'),
    ('amene', 'amène'),
    ('arrete', 'arrête'),
    ('cede', 'cède'),
    ('decide', 'décide'),
    ('decides', 'décides'),
    ('ecris', 'écris'),
    ('ecoute', 'écoute'),
    ('eloigne', 'éloigne'),
    ('protege', 'protège'),
    ('leve', 'lève'),

    # Capitalized forms
    ('Ameliore', 'Améliore'),
    ('Arrete', 'Arrête'),
    ('Arret', 'Arrêt'),
    ('Decompte', 'Décompte'),
    ('Echouer', 'Échouer'),
    ('Ecran', 'Écran'),
    ('Ecris', 'Écris'),
    ('Ecoute', 'Écoute'),
    ('Eloigne', 'Éloigne'),
    ('Etre', 'Être'),
    ('Fenetre', 'Fenêtre'),
    ('Lache', 'Lâche'),
    ('Leve', 'Lève'),
    ('Lumiere', 'Lumière'),
    ('Medire', 'Médire'),
    ('Meme', 'Même'),
    ('Protege', 'Protège'),
    ('Reagir', 'Réagir'),
    ('Reflechir', 'Réfléchir'),
    ('Reflechis', 'Réfléchis'),
    ('Regle', 'Règle'),
    ('Resiste', 'Résiste'),
    ('Tache', 'Tâche'),
    ('Trainer', 'Traîner'),
    ('Verifier', 'Vérifier'),
]

# Patterns for 'a' -> 'à' (preposition)
# Match ' a ' followed by specific words/patterns that indicate preposition usage
A_PREPOSITION_PATTERNS = [
    # a + article/possessive
    (r"\ba l'", "à l'"),
    (r"\ba la ", "à la "),
    (r"\ba le ", "à le "),
    (r"\ba un ", "à un "),
    (r"\ba une ", "à une "),
    (r"\ba ton ", "à ton "),
    (r"\ba ta ", "à ta "),
    (r"\ba sa ", "à sa "),
    (r"\ba son ", "à son "),
    (r"\ba tes ", "à tes "),
    (r"\ba ses ", "à ses "),
    (r"\ba toi", "à toi"),
    # a + specific words
    (r"\ba cause", "à cause"),
    (r"\ba voix", "à voix"),
    (r"\ba midi", "à midi"),
    (r"\ba chaque", "à chaque"),
    (r"\ba autre", "à autre"),
    (r"\ba quelqu", "à quelqu"),
    (r"\ba rien", "à rien"),
    (r"\ba mi-", "à mi-"),
    (r"\ba 100", "à 100"),
    (r"\ba 30\b", "à 30"),
    (r"\ba 3\b", "à 3"),
    (r"\ba 6\b", "à 6"),
    # a + infinitive (common patterns)
    (r"\ba retrouver", "à retrouver"),
    (r"\ba agir", "à agir"),
    (r"\ba te ", "à te "),
    (r"\ba se ", "à se "),
    (r"\ba t'", "à t'"),
    (r"\ba s'", "à s'"),
    # Specific phrases
    (r"\bcommence a\b", "commence à"),
    (r"\bbesoin a\b", "besoin à"),
    (r"\bfait confiance a\b", "fait confiance à"),
    (r" a monter", " à monter"),
    (r" a vide", " à vide"),
]


def fix_nudge_line(value_part):
    """Apply all diacritic fixes to the value portion of a nudge line."""
    original = value_part

    # 1. Apply word-boundary replacements
    for old, new in WORD_REPLACEMENTS:
        # Use word boundary for most replacements
        # For words starting with capital after quotes or spaces
        value_part = re.sub(r'\b' + re.escape(old) + r'\b', new, value_part)

    # 2. Fix 'etre' that might appear as "d'etre"
    value_part = value_part.replace("d'etre", "d'être")
    value_part = value_part.replace("d'evasion", "d'évasion")
    value_part = value_part.replace("d'echec", "d'échec")
    value_part = value_part.replace("d'energie", "d'énergie")
    value_part = value_part.replace("d'emotion", "d'émotion")
    value_part = value_part.replace("d'epuise", "d'épuisé")
    value_part = value_part.replace("d'oeuvre", "d'œuvre")
    value_part = value_part.replace("d'affilee", "d'affilée")
    value_part = value_part.replace("d'anesthesie", "d'anesthésie")
    value_part = value_part.replace("l'ecran", "l'écran")
    value_part = value_part.replace("L'ecran", "L'écran")
    value_part = value_part.replace("l'elan", "l'élan")
    value_part = value_part.replace("l'erode", "l'érode")
    value_part = value_part.replace("l'honnetete", "l'honnêteté")
    value_part = value_part.replace("l'eternite", "l'éternité")
    value_part = value_part.replace("L'honnetete", "L'honnêteté")
    value_part = value_part.replace("L'anxiete", "L'anxiété")
    value_part = value_part.replace("l'anxiete", "l'anxiété")

    # 3. Fix 'ca' -> 'ça' (standalone word, demonstrative pronoun)
    value_part = re.sub(r'\bca\b', 'ça', value_part)
    value_part = re.sub(r'\bCa\b', 'Ça', value_part)

    # 4. Fix 'a' -> 'à' (preposition patterns)
    for pattern, replacement in A_PREPOSITION_PATTERNS:
        value_part = re.sub(pattern, replacement, value_part)

    # Additional 'a' preposition fixes using context
    # " a " preceded by specific verbs/words that take 'à'
    # Fix "goutte a goutte"
    value_part = value_part.replace("goutte a goutte", "goutte à goutte")
    # Fix "face a" -> "face à"
    value_part = re.sub(r'\bface a\b', 'face à', value_part)
    # Fix "grace a" -> "grâce à"
    value_part = re.sub(r'\bgrace a\b', 'grâce à', value_part)
    value_part = re.sub(r'\bGrace a\b', 'Grâce à', value_part)

    # 5. Fix 'la' -> 'là' (adverb "there") in specific patterns
    # "pas la." / "pas la," / "pas la " (negation + there)
    value_part = re.sub(r'\bpas la\.', 'pas là.', value_part)
    value_part = re.sub(r'\bpas la,', 'pas là,', value_part)
    # "encore la." -> "encore là."
    value_part = re.sub(r'\bencore la\.', 'encore là.', value_part)
    value_part = re.sub(r'\bencore la\b', 'encore là', value_part)
    # "toujours la." -> "toujours là."
    value_part = re.sub(r'\btoujours la\.', 'toujours là.', value_part)
    value_part = re.sub(r'\btoujours la\b(?=[\.\,\s])', 'toujours là', value_part)
    # "c'est la" at end -> "c'est là"
    value_part = re.sub(r"c'est la \?", "c'est là ?", value_part)
    value_part = re.sub(r"c'est la\.", "c'est là.", value_part)
    # "La," at start when meaning "there" - like "La, tu vas bien"
    # This is tricky. "La," at start of sentence after period usually means "Là,"
    value_part = re.sub(r'(?<=\. )La, ', 'Là, ', value_part)
    value_part = re.sub(r'(?<=\. )La\.', 'Là.', value_part)
    # "entendaient la," -> "entendaient là,"
    value_part = re.sub(r'entendaient la,', 'entendaient là,', value_part)
    # "pas encore la." -> "pas encore là."
    # Already handled by "encore la" pattern above

    # 6. Fix 'ou' -> 'où' (where/when) in specific patterns
    # "ou" meaning "where" often follows nouns: "matin ou tu", "piece ou tu", "jour ou"
    value_part = re.sub(r'\bmatin ou\b', 'matin où', value_part)
    value_part = re.sub(r'\bpiece ou\b', 'pièce où', value_part)  # already fixed piece
    value_part = re.sub(r'\bpièce ou\b', 'pièce où', value_part)
    value_part = re.sub(r'\bjour ou\b', 'jour où', value_part)
    # "La ou" -> "Là où" (already fixed La->Là in some cases)
    value_part = re.sub(r'\bLa ou\b', 'Là où', value_part)
    value_part = re.sub(r'\bla ou\b', 'là où', value_part)
    # "Ou tu changes" -> "Ou" here means "Or" actually... let me check
    # In "Encore une journée qui commence mal ? Ou tu changes maintenant ?"
    # This "Ou" means "Or" so it stays. Skip this.

    # 7. Fix 'Des' -> 'Dès' (as soon as) - "Des que" -> "Dès que"
    value_part = re.sub(r'\bDes que\b', 'Dès que', value_part)
    value_part = re.sub(r'\bdes que\b', 'dès que', value_part)
    # "des aujourd'hui" -> "dès aujourd'hui"
    value_part = value_part.replace("des aujourd'hui", "dès aujourd'hui")

    # 8. Fix specific past participles that are safe in context
    # "est passe" -> "est passé" (le passé / est passé)
    value_part = re.sub(r'\best passe\b', 'est passé', value_part)
    value_part = re.sub(r'\bLe passe\b', 'Le passé', value_part)
    value_part = re.sub(r'\ble passe\b', 'le passé', value_part)
    # "est termine" -> "est terminé"
    value_part = re.sub(r'\best termine\b', 'est terminé', value_part)
    # "est reveille" -> "est réveillé"
    value_part = re.sub(r'\best reveille\b', 'est réveillé', value_part)
    # "est lance" -> "est lancé"
    value_part = re.sub(r'\best lance\b', 'est lancé', value_part)
    # "une fois lance" -> "une fois lancé"
    value_part = re.sub(r'\bfois lance\b', 'fois lancé', value_part)
    # "tu as commence" -> "tu as commencé"
    value_part = re.sub(r'\bas commence\b', 'as commencé', value_part)
    # "tu as ete" -> "tu as été" (already handled by 'ete' -> 'été')
    # "tu as parle" -> "tu as parlé"
    value_part = re.sub(r'\bas parle\b', 'as parlé', value_part)
    # "as gagne" -> "as gagné"
    value_part = re.sub(r'\bas gagne\b', 'as gagné', value_part)
    # "aies commence" -> "aies commencé"
    value_part = re.sub(r'\baies commence\b', 'aies commencé', value_part)
    # "l'aies pas fait" - OK
    # "passe a regretter" -> "passé à regretter"
    value_part = re.sub(r'\bpasse a regretter\b', 'passé à regretter', value_part)
    # "temps passe a" -> "temps passé à"
    value_part = re.sub(r'\bpasse a\b', 'passé à', value_part)
    # "force a la fin" -> "forcé à la fin"
    value_part = re.sub(r'\bforce a\b', 'forcé à', value_part)

    # 9. Fix 'sur' -> 'sûr' (safe/certain) - "est sur." meaning "is safe"
    value_part = re.sub(r'\best sur\.', 'est sûr.', value_part)
    value_part = re.sub(r'\best sur\b(?=[\.\,])', 'est sûr', value_part)

    # 10. Fix 'cote' -> 'côté'
    value_part = re.sub(r'\bcote\b', 'côté', value_part)

    # 11. Fix 'abime' -> 'abîme'
    value_part = re.sub(r'\babime\b', 'abîme', value_part)

    # 12. Fix 'ame' -> 'âme'
    value_part = re.sub(r'\bame\b', 'âme', value_part)

    # 13. Fix remaining 'la' -> 'là' patterns
    # "n'est pas la." already handled
    # "n'est plus la" -> "n'est plus là"
    value_part = re.sub(r"n'est plus la\b", "n'est plus là", value_part)
    # "pas encore la" -> "pas encore là"
    value_part = re.sub(r'\bpas encore la\b', 'pas encore là', value_part)

    # 14. Fix 'traine' -> 'traîne'
    value_part = re.sub(r'\btraine\b', 'traîne', value_part)

    return value_part


# Process each line
for line in lines:
    stripped = line.strip()
    # Only process nudge_* lines
    if stripped.startswith('"nudge_'):
        original = line
        # Split into key = value
        eq_idx = line.index(' = ')
        key_part = line[:eq_idx + 3]  # includes ' = '
        value_part = line[eq_idx + 3:]

        # Apply fixes to value only
        fixed_value = fix_nudge_line(value_part)
        new_line = key_part + fixed_value

        if new_line != original:
            fixed_count += 1
        fixed_lines.append(new_line)
    else:
        fixed_lines.append(line)

# Write back
with open(filepath, 'w', encoding='utf-8') as f:
    f.write('\n'.join(fixed_lines))

print(f"Fixed {fixed_count} lines out of total nudge lines.")
print("Done!")
