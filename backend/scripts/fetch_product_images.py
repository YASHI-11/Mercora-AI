"""Builds backend/data/product_images.json: a freely licensed photo for every
product in mercora_ml_dataset.csv, from Wikimedia Commons.

The dataset ships no photos, and there is no photo of the exact item, so each
product gets an illustrative photo of its product TYPE: every product is
mapped to a search query by the ordered rules in TYPE_QUERIES (a "WHITE
HANGING HEART T-LIGHT HOLDER" -> "tealight holder"), each query gets a pool
of Commons photos, and products of the same type are spread across their
pool by a stable hash so neighbouring products don't all share one photo.

Only openly licensed bitmaps are kept (public domain, CC0, CC BY, CC BY-SA),
and author/licence/source are stored with each photo so the product page can
attribute it. Photos whose titles suggest they aren't a plain product shot
(maps, logos, diagrams, artworks...) are skipped, and EXCLUDED_FILES lists
specific Commons files rejected after visual review.

The seed script reads the JSON; this script is the only part that needs the
network. Re-running it is incremental: pools already in the JSON are kept
(minus any EXCLUDED_FILES) and only new or empty queries are fetched; pass
--refresh to re-fetch every pool.

Usage (from backend/, with venv activated):
    python scripts/fetch_product_images.py [path/to/mercora_ml_dataset.csv] [--per-query N] [--refresh]
"""
import csv
import hashlib
import html
import json
import os
import re
import sys
import time

import requests

DEFAULT_CSV = os.path.join(os.path.dirname(__file__), "..", "..", "mercora_ml_dataset.csv")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "product_images.json")
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia asks API clients to identify themselves.
HEADERS = {"User-Agent": "MercoraCatalogImages/1.0 (Mercora AI demo store catalog builder)"}
THUMB_WIDTH = 640
STOCK_CODE_PREFIX = "OR-"

ALLOWED_LICENSES = re.compile(r"^(public domain|pd|cc0|cc by(-sa)? \d(\.\d)?( [a-z]+)?)$", re.I)
NOT_A_PRODUCT_SHOT = re.compile(
    r"\b(map|logo|diagram|chart|coat of arms|flag of|poster|painting|drawing|illustration|engraving|sketch|"
    r"lithograph|manuscript|stamp of|banknote|coin|screenshot|icon|seal of|plan of|svg|page|book cover|"
    r"advert|catalogue|newspaper|patent|figure|fig\.|scan|x-ray|microscop|museum number|mugshot|render|rendered|"
    r"shader|3d model|cgi|blender|pov-ray)\b", re.I)

# Specific Commons files rejected after looking at the contact sheets
# (wrong object, unreadable, people as the subject...). Filled in by review.
EXCLUDED_FILES: set[str] = set()

# (regex on the upper-cased product name, Commons search query); first match
# wins. Most specific phrase first, mirroring fix_dataset.TAXONOMY_RULES.
TYPE_QUERIES = [
    (r"\bHOT WATER BOTTLE\b", "hot water bottle"),
    (r"\bHAND WARMER\b|\bPOCKET WARMER\b", "hand warmer pouch"),
    (r"\bDOORMAT\b|\bACAPULCO MAT\b", "doormat"),
    (r"\bDOORSTOP\b", "doorstop"),
    (r"\bLUNCH BOX\b|\bSNACK BOX", "lunch box"),
    (r"\bLUNCH BAG\b", "lunch bag"),
    (r"\bLUGGAGE TAG", "luggage tag"),
    (r"\bPASSPORT\b", "passport cover"),
    (r"\bTRAVEL CARD WALLET\b|\bWALLET\b", "card wallet"),
    (r"\bPURSE\b", "coin purse"),
    (r"\bHANDBAG\b|\bHAND BAG\b|\bEVENING BAG\b|\bBUM BAG\b", "handbag"),
    (r"\bBACKPACK\b", "backpack"),
    (r"\b(AIRLINE|CABIN|OVERNIGHT|WEEKEND|SHOULDER) BAG\b", "travel bag"),
    (r"\bWASH ?BAG\b|\bCOSMETICS? BAG\b", "toiletry bag"),
    (r"\bPICNIC (BAG|HAMPER|BASKET)\b", "picnic basket"),
    (r"\bJUMBO\b.*\bBAG\b|\bSHOPPER\b|\bSHOPPING BAG\b|\bTOTE\b|\bCHARLOTTE BAG\b|\bSTORAGE BAG\b", "tote bag"),
    (r"\bGIFT BAG\b|\bPAPER BAG\b|\bPARTY BAG", "gift bag"),
    (r"\bNECKLACE\b|\bPENDANT\b|\bLARIAT\b|\bCHOKER\b|\bDIAMANTE CHAIN\b|\bJEWELLERY SET\b", "necklace"),
    (r"\bBRACELET\b|\bBANGLE\b", "bracelet"),
    (r"\bEARRING", "earrings"),
    (r"\bBROOCH\b", "brooch"),
    (r"\bBADGES?\b", "pin badge"),
    (r"\bKEY ?RINGS?\b|\bKEY-CHAIN|\bKEY ?CHAIN\b|\bKEY FOB\b", "keyring"),
    (r"\bRING\b", "ring jewelry"),
    (r"\bHAIR ?(CLIP|SLIDE|GRIP)", "hair clip"),
    (r"\bHAIR ?COMB\b", "hair comb"),
    (r"\bHAIR\w*\b", "hair accessory"),
    (r"\bPHONE CHARM\b|\bBAG CHARM\b|\bCHARMS?\b", "bag charm"),
    (r"\bUMBRELLA STAND\b", "umbrella stand"),
    (r"\bUMBRELLA\b", "umbrella"),
    (r"\bPONCHO\b|\bRAIN MAC\b|\bRAIN HAT\b", "raincoat"),
    (r"\bEAR MUFF", "earmuffs"),
    (r"\bSLIPPER", "slippers"),
    (r"\bSCARF\b", "scarf"),
    (r"\bSUNGLASSES\b", "sunglasses"),
    (r"\bFAN\b", "hand fan"),
    (r"\bGLASSES CASE\b", "glasses case"),
    (r"\bGLOVES\b", "gloves"),
    (r"\bLIP ?GLOSS\b", "lip gloss"),
    (r"\bCOMPACT MIRROR\b|\bPOCKET MIRROR\b", "compact mirror"),
    (r"\bFIRST AID\b|\bPLASTERS\b", "first aid kit"),
    (r"\bSOAP (DISH|HOLDER|RACK)\b", "soap dish"),
    (r"\bBATH SPONGE\b|\bSPONGE\b", "bath sponge"),
    (r"\bBATHROOM SCALES\b", "bathroom scale"),
    (r"\bTOWEL\b(?!.*\b(TEA|CAKE|SWISS ROLL)\b)|\bFLANNEL\b", "hand towel"),
    (r"\bSHOWER CAP\b", "shower cap"),
    (r"\bBATHROOM\b|\bBATH\b|\bTOILETTE\b|\bCOTTON WOOL\b|\bBALM\b|\bPERFUME\b", "bathroom accessories"),
    (r"\bT-?LIGHTS?\b|\bTEA ?LIGHTS?\b|\bTEALIGHT\b|\bVOTIVE\b", "tealight holder"),
    (r"\bCANDLE ?STICK|\bCANDELABRA\b|\bCANDLE ?STAND\b", "candlestick"),
    (r"\bCANDLE ?HOLDER|\bCANDLEHOLDER\b|\bCANDLE ?POT\b|\bCANDLE PLATE\b", "candle holder"),
    (r"\bCANDLES?\b", "candles"),
    (r"\bLANTERN", "lantern"),
    (r"\bLAMPSHADE\b|\bSHADE\b", "lampshade"),
    (r"\bCHANDELIER\b", "chandelier"),
    (r"\bLAMP\b|\bNIGHT ?LIGHT\b|\bTABLE LIGHT\b|\bBEDSIDE LIGHT\b", "table lamp"),
    (r"\bLIGHTS\b|\bLIGHT CHAIN\b|\bLIGHT GARLAND\b|\bSTRING \d+ ?LIGHT|\b\d+ LIGHT\b", "fairy lights"),
    (r"\bMATCHES\b", "matchbox"),
    (r"\bINCENSE\b", "incense sticks"),
    (r"\bOIL BURNER\b|\bFRAGRANCE OIL", "oil burner"),
    (r"\bSCENTED\b|\bSCENT\b|\bDRAWER LINER|\bLAVENDER\b", "lavender sachet"),
    (r"\bARTIFICIAL FLOWER|\bART FLOWER\b|\bPAPER FLOWERS\b|\bWOODEN DAISY\b|\bPORCELAIN ROSE\b", "artificial flowers"),
    (r"\bALARM CLOCK\b|\bTABLE CLOCK\b|\bCARRIAGE CLOCK\b|\bTRAVEL ALARM\b", "alarm clock"),
    (r"\bCLOCK\b", "wall clock"),
    (r"\bMIRROR", "wall mirror"),
    (r"\bPHOTO ALBUM\b|\bALBUM\b", "photo album"),
    (r"\bFRAME\b|\bPHOTOFRAME\b|\bPHOTO CLIP\b|\bPHOTO CUBE\b", "photo frame"),
    (r"\bCUSHION\b|\bFILLER PAD\b|\bPOUFFE\b", "cushion"),
    (r"\bTHROW\b|\bQUILT\b", "throw blanket"),
    (r"\bDRAWER KNOB\b|\bKNOB\b", "drawer knob"),
    (r"\bCOAT RACK\b|\bCOATHANGER\b|\bCOAT HANGER\b|\bHANGER\b", "coat hook rack"),
    (r"\bHOOK\b|\bHOOKS\b|\bKEY HOLDER\b|\bKEY CABINET\b", "wall hook"),
    (r"\bDOOR ?HANGER\b|\bDOORSIGN\b|\bDOOR SIGN\b(?!.*METAL)", "door sign"),
    (r"\bMETAL SIGN\b|\bSIGN\b", "vintage metal sign"),
    (r"\bTHERMOMETER\b", "wall thermometer"),
    (r"\bWALL ART\b|\bCANVAS\b|\bPRINT\b|\bPLAQUE\b|\bPICTURE\b", "framed wall art"),
    (r"\bLETTERS\b|\bBLOCK WORD\b|\bNUMBER TILE\b", "wooden letters"),
    (r"\bCABINET\b|\bCUPBOARD\b|\bSIDEBOARD\b|\bCHEST\b(?!.*TREASURE)|\bDRAWERS?\b", "wooden cabinet"),
    (r"\bSTOOL\b", "stool"),
    (r"\bCHAIR\b|\bLOVE SEAT\b", "chair"),
    (r"\bTABLE\b(?!.*DECORATION)|\bTRAY TABLE\b", "side table"),
    (r"\bSHELF\b|\bSHELVING\b", "wall shelf"),
    (r"\bMAGAZINE RACK\b|\bNEWSPAPER STAND\b", "magazine rack"),
    (r"\bSCREEN\b|\bPARTITION\b", "folding screen"),
    (r"\bCHALKBOARD\b|\bBLACK ?BOARD\b|\bMEMO ?BOARD\b|\bSLATE\b", "chalkboard"),
    (r"\bLETTER RACK\b|\bLETTER HOLDER\b|\bLETTER TRAY\b|\bWALL TIDY\b|\bORGANISER\b|\bCARD ?HOLDER\b", "desk organizer"),
    (r"\bJEWEL(LERY)? (STAND|BOX|DRAWER)\b", "jewelry box"),
    (r"\bTREASURE CHEST", "treasure chest"),
    (r"\bMONEY (BOX|BANK)\b|\bPIGGY BANK\b", "piggy bank"),
    (r"\bTISSUE BOX\b", "tissue box"),
    (r"\bSEWING BOX\b|\bSEWING KIT\b|\bNEEDLE\b|\bSEWING\b|\bPIN CUSHION\b|\bKNITTING\b", "sewing kit"),
    (r"\bTAPE MEASURE\b|\bMEASURING TAPE\b", "tape measure"),
    (r"\bTRINKET\b|\bKEEPSAKE\b|\bBOXES\b|\bBOX\b(?!.*(LUNCH|SNACK))", "decorative box"),
    (r"\bWREATH\b", "wreath"),
    (r"\bGARLAND\b", "garland decoration"),
    (r"\bMOBILE\b", "hanging mobile"),
    (r"\bCURTAIN\b", "bead curtain"),
    (r"\bWICKER\b", "wicker heart"),
    (r"\bCHRISTMAS TREE\b|\bFEATHER TREE\b", "christmas tree"),
    (r"\bADVENT\b", "advent calendar"),
    (r"\bCRACKER", "christmas cracker"),
    (r"\bSTOCKING\b", "christmas stocking"),
    (r"\bBAUBLE", "christmas bauble"),
    (r"\bCHRISTMAS\b.*\bLIGHT|\bLIGHT\b.*\bCHRISTMAS\b", "christmas lights"),
    (r"\bANGEL\b", "angel christmas decoration"),
    (r"\bREINDEER\b|\bSANTA\b|\bSNOWMAN\b|\bSNOWFLAKE\b|\bSLEIGH\b|\bNATIVITY\b", "christmas decoration"),
    (r"\bEGG CUP\b", "egg cup"),
    (r"\bEGG COSY\b|\bEGG WARMER\b", "egg cosy"),
    (r"\bEASTER EGG\b|\bEGGS?\b(?=.*\b(DECORATION|HANGING|PAINTED|PAINT)\b)|\bEGG BASKET\b|\bEGG HOUSE\b", "easter eggs"),
    (r"\bCHICK|\bHEN\b|\bCHICKEN\b", "easter chick decoration"),
    (r"\bBUNNY\b|\bBUNNIES\b|\bRABBIT\b|\bHARE\b", "easter bunny decoration"),
    (r"\bEASTER\b", "easter decoration"),
    (r"\bBUNTING\b|\bPENNANT\b", "bunting"),
    (r"\bBALLOON", "balloons"),
    (r"\bCONFETTI\b", "confetti"),
    (r"\bHONEYCOMB\b|\bPAPER (BALL|FAN|BELL)\b", "paper honeycomb ball"),
    (r"\bPAPER CHAIN\b", "paper chain"),
    (r"\bNAPKIN RING\b|\bNAPKIN CHARM", "napkin ring"),
    (r"\bNAPKIN", "paper napkins"),
    (r"\bPAPER (PLATES?|CUPS?)\b", "paper plates"),
    (r"\bSTRAWS?\b", "drinking straws"),
    (r"\bCOCKTAIL\b", "cocktail umbrella"),
    (r"\bDOIL(Y|IES)\b", "paper doily"),
    (r"\bPLACE SETTING", "place card holder"),
    (r"\bPARTY CANDLES\b|\bCELEBRATION CANDLES\b|\bCAKE CANDLE|\bBIRTHDAY CANDLE", "birthday candles"),
    (r"\bTIARA", "tiara"),
    (r"\bFLAG\b|\bWINDSOCK\b", "bunting flags"),
    (r"\bPARTY\b|\bSOMBRERO\b|\bGRASS SKIRT\b|\bLEIS\b|\bROSETTE\b|\bPOPCORN\b|\bCORDON\b", "party decorations"),
    (r"\bCAKE STAND\b", "cake stand"),
    (r"\bCAKE CASES\b|\bPETIT FOUR CASES\b|\bBAKING CASES\b|\bCUPCAKE LACE\b", "cupcake liners"),
    (r"\bCAKE TIN", "cake tin"),
    (r"\bCOOKIE CUTTER|\bBISCUIT CUTTER", "cookie cutter"),
    (r"\bMOULD", "baking mold"),
    (r"\bMIXING BOWL", "mixing bowl"),
    (r"\bROLLING PIN\b", "rolling pin"),
    (r"\bMEASURING (SPOONS|JUG)\b", "measuring spoons"),
    (r"\bCAKE (PLATE|FORK|SLICE|CARRIER)\b|\bBAKING\b|\bPASTRY\b|\bWHISK\b|\bJAM MAKING\b", "baking utensils"),
    (r"\bAPRON\b", "apron"),
    (r"\bTEA TOWEL|\bCAKE TOWEL\b|\bSWISS ROLL TOWEL\b", "tea towel"),
    (r"\bOVEN (GLOVE|MITT)\b", "oven glove"),
    (r"\bTEA COSY\b|\bMUG COSY\b", "tea cosy"),
    (r"\bTABLE ?CLOTH\b|\bTABLE RUN", "tablecloth"),
    (r"\bIRONING BOARD\b", "ironing board"),
    (r"\bTEAPOT\b|\bTEA FOR ONE\b|\bTEA SET\b|\bCOFFEE SET\b", "teapot"),
    (r"\bCUP AND SAUCER\b|\bCUP & SAUCER\b|\bTEACUP\b|\bSAUCER\b", "teacup and saucer"),
    (r"\bMUG WARMER\b", "mug warmer"),
    (r"\bBEAKER\b", "plastic beaker cup"),
    (r"\bMUG\b|\bMUGS\b", "mug"),
    (r"\bCUP\b", "cup"),
    (r"\bJUG\b|\bCREAMER\b", "milk jug"),
    (r"\bCADDY\b|\bSUGAR (BOWL|TONGS|DISPENSER)\b|\bTEA STRAINER\b", "tea caddy"),
    (r"\bTOAST ?RACK\b", "toast rack"),
    (r"\bWINE GLASS\b|\bCHAMPAGNE\b|\bGOBLET\b|\bCHALICE\b|\bAPERITIF\b", "wine glass"),
    (r"\bTUMBLER\b|\bGLASS\b(?=.*\b(TEA|MILKSHAKE|D\.O\.F)\b)", "drinking glass"),
    (r"\bBOTTLE\b", "glass bottle"),
    (r"\bCUTLERY\b|\bSPOONS?\b|\bFORKS?\b|\bTEASPOONS\b|\bCHOPSTICKS\b", "cutlery set"),
    (r"\bCOASTER", "coasters"),
    (r"\bPLACEMAT", "placemat"),
    (r"\bTRAY\b|\bTRAYS\b", "serving tray"),
    (r"\bPLATTER\b|\bCHARGER\b", "serving platter"),
    (r"\bFRUIT BOWL\b", "fruit bowl"),
    (r"\bBOWL\b|\bBOWLS\b", "ceramic bowl"),
    (r"\bPLATE\b|\bPLATES\b", "ceramic plate"),
    (r"\bDISH\b|\bSALT AND PEPPER\b|\bCONDIMENT\b", "serving dish"),
    (r"\bBREAD BIN\b", "bread bin"),
    (r"\bBISCUIT (TIN|BIN|BARREL)\b|\bTINS?\b", "biscuit tin"),
    (r"\bFOOD COVER\b", "food cover"),
    (r"\bRECIPE BOX\b", "recipe box"),
    (r"\bJARS?\b|\bJAM POT\b|\bCANISTER\b|\bCONTAINER\b|\bSTORAGE\b", "storage jar"),
    (r"\bCRATE", "wooden crate"),
    (r"\bKITCHEN SCALES\b|\bSCALES\b", "kitchen scale"),
    (r"\bCHOPPING BOARD\b", "chopping board"),
    (r"\bFRYING PAN\b|\bEGG PAN\b|\bMILK PAN\b", "frying pan"),
    (r"\bCOLANDER\b", "colander"),
    (r"\bLADLE\b|\bUTENSIL|\bSPATULA\b|\bCOOKING SET\b", "kitchen utensils"),
    (r"\bWASHING UP\b|\bSCRUBBING BRUSH\b", "washing up brush"),
    (r"\bPEG", "clothes pegs"),
    (r"\bBIN\b", "waste bin"),
    (r"\bBIRD ?(FEEDER|HOUSE|TABLE)\b|\bBIRDHOUSE\b|\bDOVECOTE\b", "bird feeder"),
    (r"\bGNOME\b", "garden gnome"),
    (r"\bCHIME\b", "wind chime"),
    (r"\bPARASOL\b", "parasol"),
    (r"\bPICNIC\b", "picnic basket"),
    (r"\bHAMMOCK\b", "hammock"),
    (r"\bCROQUET\b|\bROUNDERS\b|\bSKITTLES\b", "wooden skittles"),
    (r"\bBICYCLE\b", "bicycle bell"),
    (r"\bTORCH\b", "flashlight"),
    (r"\bFLASK\b", "vacuum flask"),
    (r"\bWATERING CAN\b", "watering can"),
    (r"\bPLANTER|\bPLANT POT\b|\bPOT HOLDER\b|\bPLANT\b|\bHERB GARDEN\b|\bCLOCHE\b", "plant pot"),
    (r"\bHERB MARKER\b|\bGARDEN MARKER\b", "plant markers"),
    (r"\bKNEELING\b", "garden kneeler"),
    (r"\bSEED|\bGROW\b|\bSOW\b|\bTWINE\b", "seed packets"),
    (r"\bTROWEL\b|\bFORK\b|\bGARDEN TOOLS\b|\bSECATEURS\b|\bTOOL SET\b|\bSCREWDRIVER\b|\bSPIRIT LEVEL\b", "garden tools"),
    (r"\bGARDEN\b", "garden decoration"),
    (r"\bPET\b|\bDOG BOWL\b|\bCAT BOWL\b|\bCAT FOOD\b|\bDOG FOOD\b", "pet bowl"),
    (r"\bDOGS? COLLAR\b", "dog collar"),
    (r"\bGREETING CARD\b|\bBIRTHDAY CARD\b|\bBLANK CARD\b|\bTHANK YOU CARD\b|\bCARD,", "greeting card"),
    (r"\bPLAYING CARDS\b|\bSNAP CARDS\b|\bCARD GAME\b", "playing cards"),
    (r"\bCHRISTMAS CARD|\bCARDS?\b.*\b1[67]\d\d\d\b|\bXMAS CARDS\b", "christmas card"),
    (r"\bPOSTCARD\b|\bNOTELET", "postcards"),
    (r"\bCARDS?\b|\bINVITES\b|\bMINICARDS\b", "greeting card"),
    (r"\bWRAP\b|\bWRAPPING\b", "wrapping paper"),
    (r"\bRIBBON", "ribbon spool"),
    (r"\bTISSUE", "tissue paper"),
    (r"\bGIFT TAG|\bTAGS\b", "gift tag"),
    (r"\bGIFT BOX", "gift box"),
    (r"\bTINSEL\b", "tinsel"),
    (r"\bNOTEBOOK|\bNOTE BOOK|\bJOURNAL\b|\bSKETCHBOOK\b|\bPOCKET BOOK\b|\bEXERCISE BOOK|\bADDRESS BOOK\b", "notebook"),
    (r"\bNOTEPAD\b|\bSTATIONERY\b|\bWRITING SET\b|\bENVELOPE", "stationery set"),
    (r"\bCALENDAR\b", "wall calendar"),
    (r"\bBOOKMARK\b|\bBOOKCOVER\b|\bBOOK COVER\b", "bookmark"),
    (r"\bCOLOURING PENCILS\b|\bCOLOUR PENCILS\b|\bPENCILS\b", "coloured pencils"),
    (r"\bCRAYON", "crayons"),
    (r"\bCHALK\b", "chalk sticks"),
    (r"\bPENCIL CASE\b|\bPEN CASE\b", "pencil case"),
    (r"\bPENS?\b|\bHIGHLIGHTER", "ballpoint pens"),
    (r"\bPENCIL\b|\bSHARPENER\b", "pencil sharpener"),
    (r"\bERASER|\bRUBBERS?\b", "erasers"),
    (r"\bRULER\b", "wooden ruler"),
    (r"\bCALCULATOR\b", "calculator"),
    (r"\bPAPERWEIGHT\b", "glass paperweight"),
    (r"\bSCISSOR", "scissors"),
    (r"\bTAPE\b|\bTAPES\b", "washi tape"),
    (r"\bHOLE PUNCH\b|\bOFFICE\b|\bDESK\b", "desk accessories"),
    (r"\bSTICKER", "sticker sheet"),
    (r"\bMAGNET", "fridge magnets"),
    (r"\bSTAMP", "rubber stamps"),
    (r"\bSTENCIL\b", "stencil"),
    (r"\bPATCHES\b|\bSEW ON\b", "iron on patches"),
    (r"\bTATTOO", "temporary tattoos"),
    (r"\bSCRAP ?BOOK\b", "scrapbook"),
    (r"\bMAGIC DRAWING SLATE\b", "magic drawing board"),
    (r"\bPAINT\b|\bMODELLING CLAY\b|\bFELTCRAFT\b.*\bKIT\b|\bKIT\b|\bCRAFT\b", "craft kit"),
    (r"\bJIGSAW\b|\bPUZZLE", "jigsaw puzzle"),
    (r"\bDOMINO", "dominoes"),
    (r"\bMARBLES\b", "marbles"),
    (r"\bSPINNING TOP", "spinning top"),
    (r"\bSKIPPING ROPE\b", "skipping rope"),
    (r"\bHELICOPTER\b|\bGLIDER", "toy glider"),
    (r"\bWINDMILL\b", "pinwheel"),
    (r"\bLUDO\b|\bBINGO\b|\bNAUGHTS\b|\bSNAKES & LADDERS\b|\bGAME\b|\bGAMES\b", "board game"),
    (r"\bHARMONICA\b", "harmonica"),
    (r"\bBUCKET\b|\bSPADE\b|\bSANDCASTLE\b", "bucket and spade"),
    (r"\bTEDDY\b|\bBEAR\b", "teddy bear"),
    (r"\bDOLL\b|\bDOLLS\b", "rag doll"),
    (r"\bPUPPET\b", "sock puppet"),
    (r"\bROCKING HORSE\b|\bPONY\b|\bHORSE\b", "wooden rocking horse"),
    (r"\bSOFT TOY\b|\bMONSTER\b|\bSPACE (CADET|FROG|OWL)\b|\bNINJA\b|\bFARM ANIMAL\b|\bMOUSE\b|\bMICE\b|\bTOY\b",
     "soft toy"),
    (r"\bBIB\b", "baby bib"),
    (r"\bBABY GIFT SET\b|\bBREAKFAST SET\b", "children's tableware"),
    (r"\bLOLLY\b|\bPOPSICLE", "popsicle mold"),
    (r"\bRADIO\b|\bBOOM ?BOX\b|\bHEADPHONES\b|\bELECTRONIC\b", "retro radio"),
    (r"\bASHTRAY\b", "ashtray"),
    (r"\bVASE\b", "vase"),
    (r"\bMUSHROOM\b|\bTOADSTOOL", "toadstool"),
    (r"\bFLYING DUCKS\b|\bDUCK", "flying ducks ornament"),
    (r"\bBUDDHA\b|\bGEISHA\b|\bFIGURINE\b|\bSTATUE\b", "figurine"),
    (r"\bSHELL\b|\bSTONES\b|\bGEMS\b|\bBALL\b", "decorative stones"),
    (r"\bHEART\b|\bHEARTS\b", "hanging heart decoration"),
    (r"\bSTAR\b", "star decoration"),
    (r"\bBUTTERFL", "butterfly decoration"),
    (r"\bBIRD\b|\bBIRDS\b|\bOWL", "bird ornament"),
    (r"\bDECORATION\b|\bHANGING\b|\bBELLS?\b", "hanging decoration"),
]
_COMPILED = [(re.compile(rx), q) for rx, q in TYPE_QUERIES]

# Fallback when no type rule matches: one query per subcategory.
SUBCATEGORY_QUERIES = {
    "Ornaments & Figurines": "decorative ornament", "Hanging Decorations": "hanging decoration",
    "Decorative Boxes": "decorative box", "Home Organisation": "desk organizer", "Furniture": "wooden cabinet",
    "Gadgets & Novelties": "retro radio", "Wall Art & Signs": "framed wall art", "Kitchen Tools": "kitchen utensils",
    "Food Storage": "storage jar", "Tableware": "ceramic plate", "Mugs & Teaware": "mug", "Glassware": "glass bottle",
    "Party Supplies": "party decorations", "Christmas": "christmas decoration", "Easter": "easter decoration",
    "Toys & Games": "wooden toy", "Hooks & Doorstops": "wall hook", "Soft Toys & Dolls": "soft toy", "Kids Crafts & Activities": "craft kit",
    "Baby & Kids Dining": "children's tableware", "Gift Wrap & Bags": "wrapping paper", "Cards": "greeting card",
    "Stickers & Magnets": "fridge magnets", "Crafts & Sewing": "sewing kit", "Pens & Desk Accessories": "ballpoint pens",
    "Notebooks & Paper": "notebook", "Picnic & Outdoor Living": "picnic basket", "Garden Decor": "garden decoration",
    "Planters & Garden Tools": "plant pot", "Bird Care": "bird feeder", "Pet Accessories": "pet bowl",
}


def type_query(name: str, subcategory: str) -> str:
    for rx, q in _COMPILED:
        if rx.search(name):
            return q
    return SUBCATEGORY_QUERIES.get(subcategory, subcategory.lower())


def _strip_html(raw: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", raw or "")).split())


def search_commons(query: str, limit: int) -> list[dict]:
    """Returns up to `limit` openly licensed product-like photos for query."""
    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6,
        "gsrsearch": f"{query} filetype:bitmap", "gsrlimit": 40, "prop": "imageinfo",
        "iiprop": "url|extmetadata|size|mime", "iiurlwidth": THUMB_WIDTH,
    }
    for attempt in range(4):
        try:
            resp = requests.get(COMMONS_API, params=params, headers=HEADERS, timeout=(10, 30))
        except requests.RequestException as exc:
            print(f"    {query!r}: {exc.__class__.__name__}, retrying", flush=True)
            time.sleep(5 * (attempt + 1))
            continue
        if resp.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        resp.raise_for_status()
        break
    else:
        return []
    pages = sorted(resp.json().get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    photos = []
    for page in pages:
        title = page["title"]
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        license_name = _strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        if (title in EXCLUDED_FILES or info.get("mime") not in ("image/jpeg", "image/png")
                or info.get("width", 0) < 400 or info.get("height", 0) < 300
                or not ALLOWED_LICENSES.match(license_name)
                or NOT_A_PRODUCT_SHOT.search(title + " " + _strip_html(meta.get("ImageDescription", {}).get("value", ""))[:300])):
            continue
        aspect = info["width"] / info["height"]
        if not 0.5 <= aspect <= 2.0:
            continue
        photos.append({
            "url": info.get("thumburl") or info["url"],
            "title": title,
            "author": _strip_html(meta.get("Artist", {}).get("value", ""))[:120] or "Unknown author",
            "license": license_name,
            "source": info.get("descriptionurl", ""),
        })
        if len(photos) >= limit:
            break
    return photos


def stock_code_of(product_id: str) -> str:
    return product_id[len(STOCK_CODE_PREFIX):] if product_id.startswith(STOCK_CODE_PREFIX) else product_id


def pick(stock_code: str, pool_size: int) -> int:
    return int(hashlib.sha1(stock_code.encode()).hexdigest(), 16) % pool_size


def main():
    argv = [a for a in sys.argv[1:] if a != "--refresh"]
    refresh = "--refresh" in sys.argv
    per_query = 10
    if "--per-query" in argv:
        i = argv.index("--per-query")
        per_query = int(argv[i + 1])
        del argv[i:i + 2]
    csv_path = os.path.abspath(argv[0] if argv else DEFAULT_CSV)

    products = {}
    with open(csv_path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            code = stock_code_of(r["product_id"])
            if code not in products:
                products[code] = type_query(r["product_name"], r["subcategory"])
    queries = sorted(set(products.values()))
    print(f"{len(products)} products -> {len(queries)} type queries")

    previous = {}
    if os.path.exists(OUT_PATH) and not refresh:
        with open(OUT_PATH, encoding="utf-8") as f:
            previous = json.load(f).get("pools", {})
    pools = {}
    for i, q in enumerate(queries, 1):
        kept = [p for p in previous.get(q, []) if p["title"] not in EXCLUDED_FILES]
        if kept:
            pools[q] = kept
            continue
        pools[q] = search_commons(q, per_query)
        print(f"  [{i}/{len(queries)}] {q!r}: {len(pools[q])} photos (fetched)", flush=True)
        time.sleep(0.3)

    empty = [q for q, p in pools.items() if not p]
    if empty:
        print(f"WARNING: no usable photos for {empty}; those products keep the generated tile")

    assignments = {code: [q, pick(code, len(pools[q]))] for code, q in products.items() if pools.get(q)}
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"source": "Wikimedia Commons", "pools": pools, "products": assignments}, f,
                  ensure_ascii=False, indent=1, sort_keys=True)
    print(f"Wrote {len(assignments)} product images ({sum(len(p) for p in pools.values())} distinct photos) "
          f"to {os.path.abspath(OUT_PATH)}")


if __name__ == "__main__":
    main()
