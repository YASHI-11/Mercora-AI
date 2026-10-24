"""Cleans mercora_ml_dataset.csv in place: every column is kept, values are
corrected.

What it fixes:
- category / subcategory: re-derived for EVERY product from its name with the
  ordered product-type rules in TAXONOMY_RULES below. The file's original
  labels were a first-keyword match that left ~19% of products blank and
  mislabelled others (a hot water bottle and a Kashmiri chair under
  Jewellery, earrings under Tableware, marbles under Tote Bags). Rules match
  the product TYPE (the noun: "cushion cover", "t-light holder", "mug"), so
  design themes in names ("fairy cake", "spaceboy", "garden") no longer drive
  the category. Seasonal themes (Christmas/Easter) override the type, except
  for cards and gift wrap, which stay with their type.
- product_name: whitespace/case normalised, stray "*" and trailing
  punctuation removed, truncated or misspelt words fixed ("NECKLAC" ->
  "NECKLACE", "ARTIIFCIAL" -> "ARTIFICIAL") so keyword search can find them.
- product_text: rebuilt in the file's own format (normalised name +
  category + subcategory + first colour word) from the corrected values.
- country: invoice codes expanded ("EIRE" -> "Ireland", "RSA" ->
  "South Africa", "USA" -> "United States").
- order_date: the handful of invoices whose lines carry slightly different
  timestamps get the invoice's earliest timestamp (one order, one moment).
- Non-merchandise lines (carriage, packing charges, image licences, gift
  vouchers) are dropped; they are fees, not products, and polluted basket
  mining. Product-level popularity columns are unaffected (they are per
  product), and customer RFM columns are left as the file computed them.

Anything a rule cannot place is reported and the script exits non-zero, so a
new product can never silently become uncategorized.

Idempotent: re-running on the cleaned file produces the same file.

Usage (from backend/, with venv activated):
    python scripts/fix_dataset.py [path/to/mercora_ml_dataset.csv] [--check]
--check classifies and reports without writing.
"""
import csv
import os
import re
import sys
from collections import Counter, defaultdict

DEFAULT_CSV = os.path.join(os.path.dirname(__file__), "..", "..", "mercora_ml_dataset.csv")

NON_MERCHANDISE = re.compile(r"^(NEXT DAY CARRIAGE|PACKING CHARGE|HIGH RESOLUTION IMAGE|.*GIFT VOUCHER.*)$", re.I)

COUNTRY_FIXES = {"EIRE": "Ireland", "RSA": "South Africa", "USA": "United States"}

# Word-level corrections for truncated/misspelt names. Applied on word
# boundaries to the upper-cased name.
NAME_FIXES = [
    (r"\bNECKLAC\b", "NECKLACE"), (r"\bNECKL\.", "NECKLACE"), (r"\bBRACLET\b", "BRACELET"),
    (r"\bARTIIFCIAL\b", "ARTIFICIAL"), (r"\bHYDRANGA\b", "HYDRANGEA"), (r"\bTRADTIONAL\b", "TRADITIONAL"),
    (r"\bTRADITIONAl\b", "TRADITIONAL"), (r"\bPAISELY\b", "PAISLEY"), (r"\bCEATURE\b", "CREATURE"),
    (r"\bSKIPPPING\b", "SKIPPING"), (r"\bBUDAH\b", "BUDDHA"), (r"\bSANDLEWOOD\b", "SANDALWOOD"),
    (r"\bLAQUERED\b", "LACQUERED"), (r"\bCANNISTER\b", "CANISTER"), (r"\bSQUARECUSHION\b", "SQUARE CUSHION"),
    (r"\bP'WEIGHT\b", "PAPERWEIGHT"), (r"\bB'FLY\b", "BUTTERFLY"), (r"\bC/COVER\b", "CUSHION COVER"),
    (r"\bASS COL\b", "ASSORTED COLOUR"), (r"\bASSTD\b", "ASSORTED"), (r"\bASST\b", "ASSORTED"),
    (r"\bCANDL\b", "CANDLE"), (r"\bCAND\b", "CANDLE"), (r"\bKNIF\b", "KNIFE"), (r"\bBRACELT\b", "BRACELET"),
    (r"\bLAMPSHADE W BEA\b", "LAMPSHADE WITH BEADS"), (r"\bPINK BUTTERFL\b", "PINK BUTTERFLY"),
    (r"\bNECKL\b", "NECKLACE"), (r"\bPHONE CHAR\b", "PHONE CHARM"), (r"\bVIPPASSPORT\b", "VIP PASSPORT"),
    (r"\bCHOCOLATECANDLE\b", "CHOCOLATE CANDLE"), (r"\bDRAWERKNOB\b", "DRAWER KNOB"),
    (r"\bHAIRSLIDE\b", "HAIR SLIDE"), (r"\bHAIRCLIPS\b", "HAIR CLIPS"), (r"\bHAIRCLIP\b", "HAIR CLIP"),
    (r"\bCAKESTAND\b", "CAKE STAND"), (r"\bFRUITBOWL\b", "FRUIT BOWL"), (r"\bBOOK MARK\b", "BOOKMARK"),
    (r"\bSHOE DEC$", "SHOE DECORATION"), (r"\bPOT W LID\b", "POT WITH LID"),
    (r"\bGARLD\b", "GARLAND"), (r"\bNECKL(?=\d|\")", "NECKLACE "), (r"\bNECKLACE(?=\d)", "NECKLACE "),
    (r"\bB'DRAW\b", "DRAWER"), (r"\bBLACKCHRISTMAS\b", "BLACK CHRISTMAS"), (r"(\d)LIGHT\b", r"\1 LIGHT"),
    (r"\bSTRAWBERY\b", "STRAWBERRY"), (r"\bBAROQUECANDLESTICK\b", "BAROQUE CANDLESTICK"),
    (r"\bFLOWE$", "FLOWER"),
]

COLOURS = ["pink", "blue", "red", "white", "green", "black", "silver", "ivory", "cream", "gold", "purple",
           "yellow", "orange", "brown", "turquoise", "grey", "lilac"]

# The taxonomy: category -> subcategories. Every rule below must target one
# of these, and every product must land in one.
TAXONOMY = {
    "Home Decor": ["Lighting & Candles", "Home Fragrance", "Hanging Decorations", "Ornaments & Figurines",
                   "Artificial Flowers", "Decorative Boxes", "Frames & Albums", "Mirrors", "Clocks",
                   "Wall Art & Signs", "Cushions & Throws", "Doormats & Rugs", "Hooks & Doorstops",
                   "Furniture", "Home Organisation", "Gadgets & Novelties"],
    "Kitchen & Dining": ["Tableware", "Mugs & Teaware", "Glassware", "Baking", "Kitchen Tools",
                         "Kitchen Textiles", "Food Storage"],
    "Bags & Accessories": ["Shopping & Tote Bags", "Lunch Bags & Boxes", "Purses & Wallets",
                           "Handbags & Backpacks", "Travel Accessories"],
    "Fashion & Jewellery": ["Necklaces", "Bracelets & Bangles", "Earrings", "Rings & Brooches",
                            "Hair Accessories", "Keyrings & Charms", "Umbrellas & Rainwear",
                            "Hot Water Bottles & Warmers", "Fashion Accessories"],
    "Bath & Beauty": ["Bath & Bathroom", "Beauty & Cosmetics"],
    "Garden & Outdoor": ["Planters & Garden Tools", "Garden Decor", "Bird Care", "Picnic & Outdoor Living"],
    "Party & Seasonal": ["Christmas", "Easter", "Party Supplies"],
    "Stationery & Gift Wrap": ["Cards", "Gift Wrap & Bags", "Notebooks & Paper", "Pens & Desk Accessories",
                               "Stickers & Magnets", "Crafts & Sewing"],
    "Toys & Kids": ["Toys & Games", "Soft Toys & Dolls", "Kids Crafts & Activities", "Baby & Kids Dining"],
    "Pets": ["Pet Accessories"],
}

H, K, B, F, BB, G, P, S, T = ("Home Decor", "Kitchen & Dining", "Bags & Accessories", "Fashion & Jewellery",
                              "Bath & Beauty", "Garden & Outdoor", "Party & Seasonal",
                              "Stationery & Gift Wrap", "Toys & Kids")

# (regex, category, subcategory), first match wins. Order:
#  1. unambiguous product types whose names carry words that later rules
#     would misread ("UNION FLAG" hot water bottle, "PEN IN GIFT BOX",
#     "CHICK" hot water bottle, "METAL SIGN" with "PARTY" in it);
#  2. cards & gift wrap, which keep their type even when Christmas-themed;
#  3. seasonal themes (Christmas, Easter);
#  4. product types, most specific phrase first.
TAXONOMY_RULES = [
    # --- 1. unambiguous types
    (r"\b\d HOOK\b|\bSINGLE HOOK\b|\bCAST IRON HOOK\b|\bCOAT RACK\b|\bSUCTION (CUP )?HOOK\b|\bSUCTION CUP\b"
     r"|\bKEY CABINET\b|\bDOORSTOP\b", H, "Hooks & Doorstops"),
    (r"\bMETAL (DOOR )?SIGN\b|\bSIGN\b.*\bMETAL\b|\bWALL ART\b(?<!MIRRORED WALL ART)|\bBLOCK WORD\b", H, "Wall Art & Signs"),
    (r"\bMIRRORED WALL ART\b(?!.*\bLAMP\b)", H, "Mirrors"),
    (r"\bCLOCKS?\b", H, "Clocks"),
    (r"\bDOORMATS?\b", H, "Doormats & Rugs"),
    (r"\bCUSHION\b(?<!PIN CUSHION)", H, "Cushions & Throws"),
    (r"\bPIN CUSHION\b|\bKNITTING (KIT|NANCY)\b|\bTAPE MEASURE\b|\bMEASURING TAPE\b|\bSEWING\b", S, "Crafts & Sewing"),
    (r"\bCABINET\b|\bCUPBOARD\b|\bSIDEBOARD\b|\bCHEST OF DRAWERS\b|\bSHELVING\b|\bUMBRELLA STAND\b|\bDESK AND CHAIR\b"
     r"|\bCUTLERY SHELF\b|\bCHAIR\b", H, "Furniture"),
    (r"\bTREASURE CHESTS?\b|\bMONEY (BANK|BOX)\b|\bPIGGY BANK\b|\bTRINKET\b|\bDRESSING TABLE POT\b", H, "Decorative Boxes"),
    (r"\bTABLE DECORATION\b|\bGINGHAM CAT\b|\bASHTRAY\b", H, "Ornaments & Figurines"),
    (r"\bBOOM ?BOX\b|\bRADIO\b|\bHEADPHONES\b|\bELECTRONIC\b", H, "Gadgets & Novelties"),
    (r"\bHOT WATER BOTTLE\b", F, "Hot Water Bottles & Warmers"),
    (r"\bKEY ?RINGS?\b|\bKEY-CHAINS?\b|\bKEY ?CHAIN\b|\bKEY FOB\b", F, "Keyrings & Charms"),
    (r"\bLUGGAGE TAGS?\b|\bPASSPORT COVER\b", B, "Travel Accessories"),
    (r"\bJUMBO\b.*\bBAG\b|\bJUMBO SHOPPER\b", B, "Shopping & Tote Bags"),
    (r"\bPICNIC (BAG|HAMPER|BASKET|BOXES|CUTLERY)\b", G, "Picnic & Outdoor Living"),
    (r"\bGARDEN (MARKER|THERMOMETER)\b", G, "Garden Decor"),
    (r"\bGARDEN GLOVES\b|\bGROW A\b", G, "Planters & Garden Tools"),
    (r"\bWASH ?BAG\b|\bCOSMETICS? BAG\b|\bBALM\b", BB, "Beauty & Cosmetics"),
    (r"\bSHOWER CAP\b|\bFIRST AID\b|\bPLASTERS\b|\bCOTTON WOOL\b|\bTOILETTE\b", BB, "Bath & Bathroom"),
    (r"\bTEA TOWELS?\b|\bCAKE TOWEL\b|\bSWISS ROLL TOWEL\b|\bEGG COSY\b|\bTEA COSY\b", K, "Kitchen Textiles"),
    (r"\bWASHING UP\b|\bPEG BAG\b|\bBOTTLE OPENER\b|\bSCRUBBING BRUSH\b", K, "Kitchen Tools"),
    (r"\bMUG (WARMER|COSY)\b|\b(MUG|TEA SET|TEAPOT) (W|IN) GIFT BOX\b", K, "Mugs & Teaware"),
    (r"\bCAKE CASES\b|\bCUP ?CAKE CASES\b|\bMIXING BOWLS\b|\bROLLING PIN\b", K, "Baking"),
    (r"^(?=.*\bCHILD(REN)?'?S\b)(?=.*\b(MUG|CUP|BOWL|PLATE|EGG CUP|BEAKER|CUTLERY|BREAKFAST SET)\b)", T,
     "Baby & Kids Dining"),
    (r"\bEGG ?CUPS?\b|\bTEA BAG PLATE\b|\bTEASPOONS\b", K, "Tableware"),
    (r"\bLETTER TRAY\b|\bWALL TIDY\b", H, "Home Organisation"),
    (r"\bNOTEBOOK\b", S, "Notebooks & Paper"),
    (r"\bPURSE\b", B, "Purses & Wallets"),
    (r"\bPENS?\b(?!.*LIP GLOSS)", S, "Pens & Desk Accessories"),
    (r"\bSTICKERS\b|\bSTICKER SHEET\b|\bSTICKER$|\bMAGNETS\b", S, "Stickers & Magnets"),
    (r"\bMAKE YOUR OWN\b.*\bKIT\b|\bHANDBAG KIT\b|\bCARD KIT\b", T, "Kids Crafts & Activities"),
    (r"\bMOUSE\b|\bMICE\b", T, "Soft Toys & Dolls"),

    # --- 2. cards & gift wrap keep their type even when Christmas-themed
    (r"\bPLAYING CARDS\b|\bSNAP CARDS\b|\bCARD GAME|\bCARD PARTY GAMES\b|\bHAPPY FAMILIES\b", T, "Toys & Games"),
    (r"\bKIT CARDS\b", T, "Kids Crafts & Activities"),
    (r"\bGREETING CARD\b|\bBIRTHDAY CARD\b|\bBLANK CARD\b|\bCARDS?\b(?! ?HOLDER)(?! WALLET)|\bPOSTCARDS?\b|\bNOTELETS?\b"
     r"|\bCHRISTMAS CARD\b|\bCARD,|\bMINICARDS\b", S, "Cards"),
    (r"\bGIFT ?WRAPS?\b|\bWRAPPING PAPER\b|^WRAP\b|\bWRAP$|\bWRAP [A-Z]+ ?DESIGN|\bTISSUES?\b(?! BOX)|\bRIBBONS?\b"
     r"|\bRIBBON REEL\b|\bGIFT BAGS?\b|\bGIFT TAGS?\b|\bWRAPPING TAPE\b|\bGIFT TAPE\b|(?<!IN )(?<!W )\bGIFT BOX(ES)?\b"
     r"|\bTINSEL REEL\b|\bCELLOPHANE\b|\bTAGS\b(?=.*\bGIFT)|\bROLL WRAP\b|\bPAPER (GIFT )?BAG\b|\bMETAL TAGS\b"
     r"|\bTISSUE REAM\b", S, "Gift Wrap & Bags"),

    # --- 3. seasonal themes
    (r"\bCHRISTMAS\b|\bXMAS\b|\bADVENT\b|\bNATIVITY\b|\bSANTA\b|\bREINDEER\b|\bSNOWMAN\b|\bSNOWFLAKE\b"
     r"|\bBAUBLES?\b|\bTINSEL\b|\bNOEL\b|\bSLEIGH\b|\bHOLLY\b|\bMISTLETOE\b|\bPOINSETTIA\b|\bFESTIVE\b"
     r"|\bGINGERBREAD\b|\bSNOW STAR\b|\bICICLE\b|\bGOOSE FEATHER TREE\b|\bJINGLE BELLS?\b|\bSTOCKING\b"
     r"|\bANGEL\b|\bCHRISTMAS TREE\b|\bTREE DECORATION\b|\bSTAR DECORATION\b|\bSWISS CHALET\b"
     r"|\bGLITTER SNOW\b|\bWOODEN STAR\b|\bTREE STAND\b|\bDOVE DECORATION\b|\bLAUREL (HEART|STAR)\b"
     r"|\bBELLS? GARLAND\b|\bGARLAND WITH STARS\b|\bCHRISTMAS\w*\b|\bPEACE ON EARTH\b|\bROBIN\b"
     r"|\bFLOCK (DROPLET|BALLS?)\b|\bTREE BALLS?\b|\bHANGING STAR\b|\bCRACKERS?\b|\bYULETIDE\b|\bSNOWMEN\b",
     P, "Christmas"),
    # Bunny/rabbit/hen motifs are used year-round (jigsaws, stickers, soft
    # toys), so they only mean Easter next to a decoration/egg word.
    (r"\bEASTER\b|\bCHICKS?\b|\bEGG (HUNT|DECORATION|BASKET|HOLDER|WARMER|HOUSE|BOX|GARLAND)\b|\bWIRE EGG\b"
     r"|^(?=.*\bEGGS?\b)(?=.*\b(DECORATION|HANGING|PAINT|PAINTED|CRATE|PICTURE BOOK|SONG BIRD)\b)"
     r"|^(?=.*\b(BUNNY|BUNNIES|RABBIT|HEN|HENS)\b)(?=.*\b(DECORATION|GARLAND|WREATH|PAINTED|SWINGING|HANGING|EGG"
     r"|NEST|HOUSE|BASKET|LADDER|BUCKET)\b)|\bHEN HOUSE\b|\bKNITTED HEN\b|\bCHICKEN DECORATION\b|\bEGG HOUSE\b",
     P, "Easter"),

    # --- 4. product types
    # toys & kids (before tableware/bags so "kids bag" stays here)
    (r"\bBABY BIB\b|\bBIBS?\b|\bBABY GIFT SET\b|\bCHILDRENS? CUTLERY\b|\bCHILDREN'?S? (MUG|BOWL|PLATE|BEAKER)\b"
     r"|\bKIDS? (CUTLERY|MUG|BOWL|PLATE)\b|\bBEAKERS?\b|\bSIPPY\b|\bBABY (MUG|BOWL|SPOON)\b"
     r"|\bCHILDRENS DINNER SET\b|\bLOLLY MAKERS\b|\bICE LOLLY MOULDS\b", T, "Baby & Kids Dining"),
    (r"\bSOFT TOY\b|\bTEDDY\b|\bDOLL\b|\bDOLLS\b|\bSOCK PUPPET\b|\bPUPPET\b|\bKNITTED (RABBIT|DUCK|BEAR|DOG)\b"
     r"|\bRAG DOLL\b|\bPLUSH\b|\bSPACE (CADET|FROG|OWL)\b|\bNINJA RABBIT\b|\bFLORAL (BLUE|PINK) MONSTER\b"
     r"|\bFELT FARM ANIMAL\b|\bFABRIC PONY\b|\bFLOWERS PONY\b|\bMONSTER SOFT\b|\bROCKING HORSE\b"
     r"|\bSCOTTIE DOG W FLOWER\b|\bBEAR\b(?!.*\b(KEYRING|MUG|BAG)\b)|\bPEG BAG\b(?=.*TOY)", T, "Soft Toys & Dolls"),
    (r"\bFELTCRAFT\b.*\b(KIT|FRIENDS|MICE|BUTTERFLY|FLOWER)\b|\bCRAFT KIT\b|\bSTENCIL\b|\bCOLOURING\b|\bCRAYONS?\b"
     r"|\bMODELLING CLAY\b|\bPAINT YOUR OWN\b|\bTATTOOS?\b|\bCHALK\b|\bMAGIC DRAWING\b|\bSTAMP SET\b|\bSTAMPS\b"
     r"|\bSCRAP ?BOOK\b|\bSTICKY BUNNIES\b|\bIRON ON\b|\bPATCHES\b|\bGROWING FROM PAPER\b|\bMAGIC TREE\b"
     r"|\bPAINTING SET\b|\bSCRATCH\b|\bWOOL GROWING\b|\bJEWELLERY MAKING\b|\bMAKE YOUR OWN\b|\bBUBBLES\b"
     r"|\bPOM POM KIT\b|\bSEWING KIT\b(?=.*\bKIDS?\b)|\bDIY\b|\bWRITING SET\b(?=.*\b(DINOSAUR|SKULL|SPACE)\b)",
     T, "Kids Crafts & Activities"),
    (r"\bGAMES?\b|\bJIGSAW\b|\bPUZZLES?\b|\bSPINNING TOPS?\b|\bSKIPPING ROPE\b|\bHELICOPTER\b|\bBINGO\b|\bLUDO\b"
     r"|\bDOMINOES\b|\bDOMINO\b|\bMARBLES\b|\bSKITTLES\b|\bNAUGHTS|\bNOUGHTS|\bYO-?YO\b|\bKALEIDOSCOPE\b"
     r"|\bTOY\b|\bTOYS\b|\bSPACEBOY ROCKET\b|\bWHEELBARROW FOR CHILDREN\b|\bCHILDS GARDEN\b|\bFLYING DISC\b"
     r"|\bCREEPY CRAWLIE|\bDINOSAUR SET\b|\bSNAKE SET\b|\bFARMYARD ANIMALS\b|\bRATTLE SNAKE EGGS\b"
     r"|\bGLOW IN DARK\b|\bGLIDERS?\b|\bWINDMILL\b|\bPOP ?GUN\b|\bSTRESS BALL\b|\bMAGIC\b(?=.*\bTRICK)"
     r"|\bSPORTING FUN\b|\bBEACH SPADE\b|\bSEASIDE BUCKET\b|\bBUCKET AND SPADE\b|\bSANDCASTLE\b"
     r"|\bDOLLY PEGS\b|\bTRAIN\b|\bTOP TRUMPS\b|\bSPACEBOY\b.*\bPLAY\b|\bRACING\b|\bMINI JIGSAW\b"
     r"|\bABC BLOCKS?\b|\bALPHABET BLOCKS\b|\bJIGSAW BLOCKS\b|\bCHILDRENS? (BINOCULARS|TELESCOPE)\b|\bDRUM\b"
     r"|\bHARMONICA\b|\bWHISTLE\b|\bBOWLING\b|\bQUOITS\b|\bKITE\b|\bBALLOON(?! WHISK)\b(?=.*WATER)"
     r"|\bDARTS\b|\bBOOMERANG\b|\bTRUMPET\b|\bHAND PAINTED\b(?=.*ROCKING)", T, "Toys & Games"),

    # specific types that generic rules further down would misfile
    (r"\b(TEA|MILKSHAKE|APERITIF|SHOT|JUICE|WATER|WINE|D\.O\.F\.) GLASS(ES)?\b", K, "Glassware"),
    (r"\bPLAYHOUSE\b|\bINFLATABLE\b|\bSNAKES & LADDERS\b", T, "Toys & Games"),
    (r"\bPAINT SET\b", T, "Kids Crafts & Activities"),
    (r"\bRAIN MAC\b|\bCHILD(REN)?'?S UMBRELLA\b", F, "Umbrellas & Rainwear"),
    (r"\bJEWEL(LERY)? (STAND|DRAWER)\b", H, "Home Organisation"),
    (r"\bJAM POT\b|\bPOT WITH LID\b|\bTEA,COFFEE,SUGAR\b", K, "Food Storage"),
    (r"\bCADDY\b", K, "Mugs & Teaware"),
    (r"\bTOAST ITS\b", K, "Kitchen Tools"),
    (r"\bTRAYS\b", K, "Tableware"),
    (r"\bHEART (IVORY |BEADED )?TRELLIS\b(?!.*T-LIGHT)", H, "Hanging Decorations"),

    # --- party
    (r"\bPARTY\b|\bBUNTING\b|\bBALLOONS?\b(?! WHISK)|\bCONFETTI\b|\bPAPER (PLATES?|CUPS?|NAPKINS?)\b|\bNAPKINS?\b"
     r"|\bPLATES?\b(?=.*\bPAPER\b)|\bCUPS?\b(?=.*\bPAPER\b)|\bSTRAWS?\b|\bCOCKTAIL\b|\bCAKE CANDLES?\b"
     r"|\bBIRTHDAY\b|\bDOILIES\b|\bDOILY\b(?=.*\bSET\b)|\bPARTY BAGS?\b|\bPINATA\b|\bPARTY CONES\b|\bHATS?\b(?=.*PARTY)"
     r"|\bHONEYCOMB\b|\bTIARAS?\b|\bGRASS SKIRT\b|\bLEIS\b|\bSOMBRERO\b|\bROSETTE\b|\bPENNANT\b|\bFLAGS\b"
     r"|^FLAG OF\b|\bCAR FLAG\b|\bCELEBRATION CANDLES\b|\bPARTY CANDLES\b|\bCORDON\b"
     r"|\bWINDSOCK\b|\bPLACE SETTINGS?\b|\bNAPKIN CHARMS?\b|\bPICKS\b|\bCUPCAKE TOPPERS?\b|\bWEDDING\b"
     r"|\bFANCY DRESS\b|\bMASKS?\b|\bPAPER CHAIN\b|\bPAPER BALL\b|\bPAPER FAN\b|\bHONEYCOMB FAN\b"
     r"|\bPOPCORN HOLDER\b|\bICE CREAM SUNDAE\b(?!.*LIP)", P, "Party Supplies"),

    # --- pets
    (r"\bDOGS? COLLAR\b|\bPET\b|\b(CAT|DOG) FOOD\b|\bDOG BOWL\b|\bCAT BOWL\b|\bDOG LEAD\b|\bDOGGY\b(?!.*RUBBER)",
     "Pets", "Pet Accessories"),

    # --- bags
    (r"\bLUNCH (BAG|BOX)\b|\bSNACK BOX(ES)?\b|\bLUNCHBOX\b", B, "Lunch Bags & Boxes"),
    (r"\bLUGGAGE TAGS?\b|\bPASSPORT\b|\bTRAVEL CARD\b|\bTRAVEL (WALLET|ADAPTOR)\b|\bTRAVEL FIRST AID\b",
     B, "Travel Accessories"),
    (r"\bPURSE\b|\bWALLET\b|\bCOIN\b(?=.*\bPURSE)|\bCARD HOLDER\b(?=.*\bWALLET)", B, "Purses & Wallets"),
    (r"\bHANDBAG\b|\bHAND BAG\b|\bBACKPACK\b|\bRUCKSACK\b|\bSHOULDER BAG\b|\bWEEKEND BAG\b|\bSATCHEL\b|\bCLUTCH\b"
     r"|\bHOLDALL\b|\bMESSENGER\b|\bKIDS BAG\b|\bSCHOOL BAG\b|\bPOCKET BAG\b|\bDRAWSTRING BAG\b"
     r"|\b(AIRLINE|CABIN|OVERNIGHT|EVENING|BUM) BAG\b", B, "Handbags & Backpacks"),
    (r"\bSPONGE BAG\b|\bMAKE ?UP BAG\b", BB, "Beauty & Cosmetics"),
    # "... IN BAG" / "GAUZE BAG" describe packaging, not a bag product.
    (r"\bSHOPPER\b|\bSHOPPING BAG\b|\bTOTE\b|\bCHARLOTTE BAG\b|\bSTORAGE BAG\b"
     r"|(?<!IN )(?<!GAUZE )(?<!COTTON )\bBAG\b(?!.*CHARM)(?! OF)", B, "Shopping & Tote Bags"),

    # --- jewellery & fashion
    (r"\bNECKLACE\b|\bPENDANT\b|\bLARIAT\b|\bCHOKER\b|\bBEAD CHAIN\b|\bDIAMANTE CHAIN\b|\bLOCKET\b", F, "Necklaces"),
    (r"\bBRACELET\b|\bBANGLES?\b|\bCUFF\b|\bANKLET\b", F, "Bracelets & Bangles"),
    (r"\bEARRINGS?\b|\bEAR ?STUDS?\b", F, "Earrings"),
    (r"\bRING\b(?!.*\bBINDER\b)|\bRINGS\b(?!.*LAMPSHADE)(?<!NAPKIN RINGS)|\bBROOCH\b|\bBADGES?\b|\bCORSAGE\b",
     F, "Rings & Brooches"),
    (r"\bHAIR\w*\b|\bSLIDES?\b|\bHAIRBAND\b|\bHEADBAND\b|\bSCRUNCHIE\b|\bCLIPS?\b(?=.*\b(HAIR)\b)"
     r"|\bFLOWER CLUSTER SLIDE\b|\bALICE BAND\b|\bCOMB\b", F, "Hair Accessories"),
    (r"\bKEY ?RINGS?\b|\bKEY-CHAINS?\b|\bKEYCHAIN\b|\bKEY FOB\b|\bPHONE CHARM\b|\bBAG CHARM\b|\bCHARMS?\b(?!.*NAPKIN)",
     F, "Keyrings & Charms"),
    (r"\bUMBRELLA\b|\bPONCHO\b|\bRAIN HAT\b|\bWELLIES\b|\bWELLINGTON\b", F, "Umbrellas & Rainwear"),
    (r"\bHAND WARMER\b|\bPOCKET WARMER\b|\bHOTTIE\b|\bEAR MUFF\b|\bSLIPPERS?\b|\bGLOVES\b|\bMITTENS?\b|\bSOCKS\b"
     r"|\bWARMER\b(?!.*EGG)", F, "Hot Water Bottles & Warmers"),
    (r"\bSCARF\b|\bSILK FAN\b|\bTRAVELING FAN\b|\bSANDALWOOD FAN\b|\bGLASSES CASE\b|\bSPECTACLE\b|\bSUNGLASSES\b"
     r"|\bSHAWL\b|\bBELT\b|\bHAT\b(?!.*PARTY)|\bCAP\b", F, "Fashion Accessories"),

    # --- lighting & fragrance (before kitchen/garden: "dinner candles",
    # "jam jar t-light holder", "incense in tin", "pot plant candle")
    (r"\bT-?LIGHTS?\b|\bTEA ?LIGHTS?\b|\bTEALIGHT\b|\bCANDLES?\b|\bCANDLE ?HOLDERS?\b|\bCANDLEHOLDER\b"
     r"|\bCANDLESTICKS?\b|\bCANDLE ?STAND\b|\bCANDELABRA\b|\bVOTIVE\b|\bLANTERNS?\b|\bLAMPS?\b|\bLAMPSHADE\b"
     r"|\bLIGHT CHAIN\b|\bLIGHTS\b|\bNIGHT ?LIGHT\b|\bCHANDELIER\b(?!.*EARRINGS)|\bLIGHTBULB\b|\bBULB\b"
     r"|\bLIGHT\b(?! (BLUE|PINK|GREEN|TOPAZ))|\bSILICON CUBE\b|\bMIRROR BALL\b|\bDISCO BALL ROTATOR\b|\bMATCHES\b"
     r"|\bLED\b|\bCANDLE ?POTS?\b|\bSHADE\b|\bCANDLE SPIKE\b|\bBIRD LIGHT\b", H, "Lighting & Candles"),
    (r"\bINCENSE\b|\bOIL BURNER\b|\bFRAGRANCE\b|\bSCENTED\b|\bSCENT\b|\bPOT ?POURRI\b|\bDIFFUSER\b|\bREED\b"
     r"|\bLAVENDER\b(?=.*\b(BAG|HEART|SACHET)\b)|\bDRAWER LINERS?\b|\bSACHETS?\b|\bWAX\b|\bAROMA\b",
     H, "Home Fragrance"),

    # --- bath & beauty
    (r"\bLIP ?GLOSS\b|\bLIPSTICK\b(?!.*PEN)|\bNAIL\b|\bCOMPACT MIRROR\b|\bMAKE ?UP\b|\bCOSMETIC\b|\bMANICURE\b"
     r"|\bPERFUME\b|\bBATH SALTS?\b|\bBODY\b|\bLOTION\b|\bLIP BALM\b|\bSOAP\b(?! ?(DISH|HOLDER))(?=.*\b(BAR|GIFT|SCENTED|SET)\b)",
     BB, "Beauty & Cosmetics"),
    (r"\bSOAP\b|\bBATH\b|\bBATHROOM\b|\bSHOWER\b|\bTOWEL\b|\bFLANNEL\b|\bTOILET\b(?!.*SIGN)|\bSPONGE\b"
     r"|\bLOOFAH\b|\bSCALES\b(?=.*BATHROOM)",
     BB, "Bath & Bathroom"),

    # --- garden & outdoor
    (r"\bBIRD ?(FEEDER|HOUSE|TABLE|BATH|BOX)\b|\bBIRDHOUSE\b|\bBIRD SEED\b|\bNESTING\b(?=.*BIRD)|\bFEEDER\b",
     G, "Bird Care"),
    (r"\bPARASOL\b|\bPICNIC\b|\bHAMMOCK\b|\bCROQUET\b|\bROUNDERS\b|\bGARDEN SET\b|\bCAMPING\b|\bBICYCLE\b"
     r"|\bOUTDOOR\b|\bDECKCHAIR\b|\bBEACH\b(?!.*HUT)|\bWINDBREAK\b|\bPUNCTURE\b|\bLED TORCH\b|\bTORCH\b"
     r"|\bCOOL ?BAG\b|\bFLASK\b(?!.*DECORATIVE)", G, "Picnic & Outdoor Living"),
    (r"\bPLANTERS?\b|\bPLANT POTS?\b|\bFLOWER POT\b|\bPLANT\b|\bPOTS?\b(?=.*\b(HERB|PLANT|FLOWER|ZINC|TERRACOTTA)\b)"
     r"|\bWATERING CAN\b|\bTROWEL\b|\bGARDEN (TOOLS?|FORK|GLOVES|KNEELER|TWINE|STAKES?)\b|\bKNEELING PAD\b"
     r"|\bKNEELING MAT\b|\bHERB (MARKER|GARDEN|POTS?)\b|\bSEEDS?\b|\bGROW YOUR OWN\b|\bSOW\b|\bTWINE\b"
     r"|\bSECATEURS\b|\bWINDOW BOX\b|\bHANGING BASKET\b|\bTRELLIS\b(?!.*HEART)|\bPOLE SUPPORT\b|\bCLOCHE\b"
     r"|\bSPIRIT LEVEL\b|\bSCREWDRIVER\b|\bTOOL SET\b|\bTOOLS\b", G, "Planters & Garden Tools"),
    (r"\bGNOME\b|\bGARDEN\b(?=.*\b(ORNAMENT|SIGN|DECORATION|STAKE|SCULPTURE|MARKER)\b)|\bSTONE\b(?=.*GARDEN)"
     r"|\bWIND ?CHIME\b|\bCHIMES?\b|\bNUMBER TILE\b(?=.*GARDEN)|\bFAIRY POLE\b|\bDECORATIVE GARDEN\b"
     r"|\bGARDEN\b(?=.*\bTILE\b)", G, "Garden Decor"),

    # --- kitchen & dining
    (r"\bCAKE CASES\b|\bPETIT FOUR CASES\b|\bBAKING\b|\bCAKE TINS?\b|\bCAKE STAND\b|\bCAKE PLATE\b|\bCAKE CARRIER\b"
     r"|\bCAKE MOULD\b|\bJELLY MOULDS?\b|\bMOULDS?\b|\bCUTTERS?\b|\bROLLING PIN\b|\bPASTRY\b|\bICING\b|\bWHISK\b"
     r"|\bMEASURING (SPOONS?|JUG|CUPS?)\b|\bCAKE SLICE\b|\bBUN CASES\b|\bCUPCAKE CASES\b|\bMIXING BOWL\b"
     r"|\bCAKE DOME\b|\bCAKE\b(?=.*\b(SERVER|KNIFE|FORKS?|TIN|STAND)\b)|\bJAM MAKING\b|\bBAKE\b|\bMUFFIN\b|\bCUPCAKE LACE\b",
     K, "Baking"),
    (r"\bAPRON\b|\bTEA TOWELS?\b|\bOVEN (GLOVE|MITT)\b|\bTABLE ?CLOTH\b|\bTABLE RUN(NER)?\b|\bTEA COSY\b"
     r"|\bCAKE TOWEL\b|\bSWISS ROLL TOWEL\b|\bPOT HOLDER\b|\bIRONING BOARD COVER\b|\bOVEN MITT\b|\bKITCHEN TOWEL\b",
     K, "Kitchen Textiles"),
    (r"\bMUGS?\b|\bTEA ?CUPS?\b|\bCUPS?\b|\bSAUCERS?\b|\bTEAPOTS?\b|\bTEA SET\b|\bCOFFEE SET\b|\bTEA FOR ONE\b"
     r"|\bTEA STRAINER\b|\bCOFFEE POT\b|\bMILK JUG\b|\bJUGS?\b|\bCREAMER\b|\bESPRESSO\b|\bCAFETIERE\b|\bINFUSER\b"
     r"|\bTEA TIME\b(?=.*\b(SET|POT)\b)|\bSUGAR (BOWL|DISPENSER|TONGS)\b|\bTOAST ?RACK\b|\bTOASTRACK\b"
     r"|\bTEA CADDY\b", K, "Mugs & Teaware"),
    (r"\bGLASS(ES)?\b(?=.*\b(TUMBLER|GOBLET|CHALICE|WINE|DRINKING)\b)|\bTUMBLERS?\b|\bGOBLET\b|\bCHALICE\b"
     r"|\bCHAMPAGNE\b|\bWINE GLASS\b|\bDRINKING GLASS\b|\bCARAFE\b|\bDECANTER\b|\bMILK BOTTLE\b|\bWATER BOTTLE\b"
     r"|\bBOTTLE\b(?!.*(HOT WATER|MAGNETS?|TOP))|\bFLASK\b", K, "Glassware"),
    (r"\bPLATES?\b|\bBOWLS?\b|\bPLATTER\b|\bCUTLERY\b|\bCHOPSTICKS\b|\bSPOONS?\b|\bFORKS?\b|\bKNIFE\b|\bKNIVES\b"
     r"|\bDINNER\b|\bTRAY\b|\bPLACEMATS?\b|\bPLACE MATS?\b|\bCOASTERS?\b|\bEGG ?CUPS?\b|\bSERVING\b|\bBUTTER DISH\b"
     r"|\bBEURRE DISH\b|\bCONDIMENT\b|\bSALT AND PEPPER\b|\bSALT & PEPPER\b|\bCRUET\b|\bRAMEKIN\b|\bDISH\b(?!.*SOAP)"
     r"|\bCAKE PLATE\b|\bBREAKFAST\b|\bTABLEWARE\b|\bLATTICE CHARGER\b|\bCHARGER\b|\bTRIVET\b|\bNAPKIN RINGS?\b"
     r"|\bSERVIETTE\b|\bPICNIC SET\b|\bPUDDING BOWL\b|\bBREAD BASKET\b|\bFRUIT BOWL\b|\bCHEESE\b(?=.*\bBOARD|DOME)",
     K, "Tableware"),
    (r"\bJARS?\b|\bTINS?\b|\bCANISTERS?\b|\bCONTAINERS?\b|\bBREAD BIN\b|\bBISCUIT (BIN|BARREL|TIN)\b|\bFOOD COVER\b"
     r"|\bCOOKIE JAR\b|\bSTORAGE\b|\bSPICE\b|\bLARDER\b|\bRECIPE BOX\b|\bKILNER\b|\bBOTTLES IN CRATE\b"
     r"|\bMARKET CRATES?\b|\bCRATE\b(?!.*EGG)|\bPANTRY\b(?=.*\b(JAR|TIN|BOX)\b)|\bCAMEMBERT\b|\bSTACKING TINS\b"
     r"|\bBASKETS?\b(?=.*\b(WICKER|STORAGE|BREAD|KITCHEN|CARRY-ALL|FRENCH)\b)|\bCARRY-ALL BASKET\b"
     r"|\bROUND CONTAINER\b|\bFOOD CONTAINER\b|\bLUNCH\b", K, "Food Storage"),
    (r"\bSCALES\b|\bCHOPPING BOARD\b|\bCOLANDER\b|\bFRYING PAN\b|\bMILK PAN\b|\bPANS?\b|\bLADLE\b|\bSQUEEZER\b"
     r"|\bKITCHEN THERMOMETER\b|\bAPPLE CORER\b|\bUTENSILS?\b|\bCOOKING SET\b|\bKITCHEN ORGANISER\b|\bTIMER\b"
     r"|\bKITCHEN\b(?=.*\b(SCALES|ROLL|TOOL|SET)\b)|\bPEELER\b|\bGRATER\b|\bSPATULA\b|\bTONGS\b|\bOPENER\b"
     r"|\bCORKSCREW\b|\bSIEVE\b|\bMASHER\b|\bGARLIC\b|\bNUTCRACKER\b|\bWASHING UP BRUSH\b|\bDISH BRUSH\b"
     r"|\bPASTRY BRUSH\b|\bFLY SWAT\b|\bCLOTHES PEGS?\b|\bPEGS\b(?=.*\b(TUB|PACK|CLOTHES)\b)|\bMAGNETIC SHOPPING LIST\b"
     r"|\bSHOPPING LIST\b|\bRECIPE BOOK STAND\b|\bFIRE BUCKET\b|\bWATER BASIN\b|\bWASTE ?BIN\b|\bBULLET BIN\b"
     r"|\bWASTEPAPER BIN\b|\bBIN\b", K, "Kitchen Tools"),

    # --- stationery
    (r"\bNOTEBOOKS?\b|\bNOTE ?BOOKS?\b|\bJOURNAL\b|\bSKETCH ?BOOK\b|\bPOCKET BOOK\b|\bADDRESS BOOK\b|\bNOTEPAD\b"
     r"|\bNOTE ?PAD\b|\bDIARY\b|\bEXERCISE BOOKS?\b|\bWRITING (PAD|PAPER)\b|\bENVELOPES?\b|\bPAPER\b(?=.*\bPACK\b)"
     r"|\bCALENDAR\b|\bPLANNER\b|\bLETTER PAPER\b|\bSTATIONERY\b|\bMEMO PAD\b|\bWRITING SET\b|\bRECIPE BOOK\b"
     r"|\bPHOTO BOOK\b|\bGUEST BOOK\b|\bBOOK ?COVER\b|\bBOOKCOVER\b|\bBOOKMARK\b|\bLIST PAD\b", S, "Notebooks & Paper"),
    (r"\bPENS?\b|\bPENCILS?\b|\bERASERS?\b|\bRUBBERS?\b|\bRULER\b|\bSHARPENER\b|\bCALCULATOR\b|\bSTAPLER\b"
     r"|\bHOLE PUNCH\b|\bTAPE DISPENSER\b|\bPAPERWEIGHT\b|\bHIGHLIGHTER\b|\bCRAYON\b|\bPENCIL CASE\b|\bDESK\b"
     r"|\bOFFICE\b(?!.*MIRROR BALL)|\bPAPER CLIPS?\b|\bTAPE MEASURE\b|\bMEASURING TAPE\b|\bFOLDING RULER\b"
     r"|\bSCISSORS?\b|\bTAPES?\b(?!.*WRAPPING)|\bPENCIL\b|\bMARKER\b(?!.*HERB)", S, "Pens & Desk Accessories"),
    (r"\bSTICKERS?\b|\bSTICKER SHEET\b|\bMAGNETS?\b|\bFRIDGE MAGNET\b|\bTRANSFERS?\b", S, "Stickers & Magnets"),
    (r"\bSEWING\b|\bNEEDLE\b|\bKNITTING\b|\bCROCHET FLOWERS\b|\bSEW ON\b|\bBUTTONS?\b(?=.*\b(JAR|BOX|SET|SEWING)\b)"
     r"|\bTHREAD\b|\bTHIMBLE\b|\bREPAIR KIT\b|\bHABERDASHERY\b|\bPIN CUSHION\b|\bEMBROIDERY\b|\bCRAFT\b",
     S, "Crafts & Sewing"),

    # --- home decor
    (r"\bARTIFICIAL FLOWERS?\b|\bART FLOWER\b|\bFLOWER GARLAND\b(?!.*CHRISTMAS)|\bFAKE\b|\bSILK FLOWER\b"
     r"|\bPAPER FLOWERS?\b|\bSCENTED FLOWER\b|\bROSE (LARGE|SMALL)$|\bBLOSSOM\b(?=.*\bBRANCH)|\bBOUQUET\b"
     r"|\bWOODEN DAISY\b", H, "Artificial Flowers"),
    (r"\bCLOCKS?\b", H, "Clocks"),
    (r"\bMIRRORS?\b|\bMIRRORED\b", H, "Mirrors"),
    (r"\bPHOTO ?FRAMES?\b|\bPICTURE FRAMES?\b|\bFRAMES?\b|\bPHOTO ALBUM\b|\bALBUM\b|\bPHOTO CUBE\b|\bPHOTOFRAME\b"
     r"|\bPHOTO CLIP\b|\bPORTRAIT\b|\bPHOTO HOLDER\b|\bMEMO CLIP\b|\bPOSTCARD SPRING\b|\bPHOTO\b",
     H, "Frames & Albums"),
    (r"\bDOORMATS?\b|\bDOOR MAT\b|\bRUGS?\b|\bMATS?\b|\bACAPULCO MAT\b", H, "Doormats & Rugs"),
    (r"\bCUSHIONS?\b|\bCUSHION COVERS?\b|\bTHROW\b|\bQUILT\b|\bFILLER PAD\b|\bBLANKET\b|\bBEDSPREAD\b|\bPILLOW\b"
     r"|\bEIDERDOWN\b|\bPOUFFE\b|\bBEANBAG\b", H, "Cushions & Throws"),
    (r"\bDOORSTOPS?\b|\bDOOR STOP\b|\bHOOKS?\b|\bHANGERS?\b|\bCOAT ?RACK\b|\bCOATHANGER\b|\bKEY HOLDER\b"
     r"|\bKEY CABINET\b|\bDOOR ?HANGER\b|\bDOOR KNOB\b|\bDRAWER KNOB\b|\bKNOBS?\b|\bPEG RAIL\b|\bDOORBELL\b"
     r"|\bDOORSIGN\b|\bDOOR SIGN\b(?!.*METAL)|\bCLIPS\b(?=.*\bSTRING\b)", H, "Hooks & Doorstops"),
    (r"\bCABINET\b|\bCUPBOARD\b|\bSIDEBOARD\b|\bSHELF\b|\bSHELVES\b|\bSTOOL\b|\bCHAIR\b|\bTABLE\b(?!.*(CLOCK|LANTERN))"
     r"|\bLOVE SEAT\b|\bBENCH\b|\bDRAWERS?\b(?!.*LINER)|\bCHEST\b(?!.*TREASURE)|\bSCREEN\b|\bPARTITION\b"
     r"|\bWARDROBE\b|\bDRESSER\b|\bDESK\b|\bFOOT STOOL\b|\bMAGAZINE RACK\b|\bNEWSPAPER STAND\b|\bSHOE TIDY\b"
     r"|\bCURIO\b|\bBOOKCASE\b|\bTROLLEY\b|\bCHAIR\b", H, "Furniture"),
    (r"\bWALL TIDY\b|\bLETTER RACK\b|\bLETTER HOLDER\b|\bMEMO ?BOARD\b|\bBLACK ?BOARD\b|\bCHALKBOARD\b"
     r"|\bORGANISER\b|\bJEWELLERY STAND\b|\bJEWELLERY BOX\b|\bTIDY\b|\bNOTICE BOARD\b|\bPIN BOARD\b"
     r"|\bKEY RACK\b|\bMAGAZINE\b|\bLETTER\b(?=.*RACK)|\bDOCUMENT\b|\bFILE\b|\bCD WALL\b|\bA4 WALL\b|\bCARDHOLDER\b"
     r"|\bCARD HOLDER\b|\bMETAL STRING\b|\bLOVE BUCKET\b|\bBASKETS?\b|\bBUCKET\b", H, "Home Organisation"),
    (r"\bMETAL SIGN\b|\bSIGNS?\b|\bPLAQUE\b|\bWALL ART\b|\bCANVAS ART\b|\bART PICTURE\b|\bPRINTS?\b|\bPOSTER\b"
     r"|\bWOOD LETTERS\b|\bBLOCK LETTERS\b|\bPAINTED LETTERS\b|\bNUMBER TILE\b|\bWALL DECAL\b|\bWALL STICKER\b"
     r"|\bWALL THERMOMETER\b|\bTHERMOMETER\b|\bPICTURE\b|\bCANVAS\b|\bTILES?\b|\bLETTERS\b", H, "Wall Art & Signs"),
    (r"\bTRINKET\b|\bMONEY ?BOX\b|\bMONEY BANK\b|\bTREASURE CHESTS?\b|\bTISSUE BOX\b|\bNESTING BOXES\b|\bBOX(ES)?\b"
     r"|\bCASE\b|\bCASES\b|\bCASKET\b|\bKEEPSAKE\b", H, "Decorative Boxes"),
    (r"\bHANGING\b|\bGARLAND\b|\bWREATH\b|\bWICKER (HEART|STAR)\b|\bHEART OF WICKER\b|\bMOBILE\b|\bCURTAIN\b"
     r"|\bSTRING OF\b|\bDECORATION\b|\bDECORATIONS\b|\bSPIRAL\b|\bFILIGREE\b|\bFILIGRIS\b|\bWIRE HEART\b"
     r"|\bFELT HEART\b|\bFABRIC HEART\b|\bWICKER\b|\bBELLS\b|\bSUNCATCHER\b|\bDREAMCATCHER\b|\bWINDCHIME\b"
     r"|\bSPRIG\b|\bTRELLIS\b|\bHEART\b(?=.*\b(LARGE|SMALL|MEDIUM)\b)|\bCLIP ON\b|\bBUTTERFLIES\b",
     H, "Hanging Decorations"),
    (r"\bORNAMENTS?\b|\bFIGURINES?\b|\bSTATUE\b|\bBUDDHA\b|\bGEISHA\b|\bFLYING DUCKS\b|\bMUSHROOM\b|\bTOADSTOOLS?\b"
     r"|\bCERAMIC BALL\b|\bSHELL\b|\bSHELLS\b|\bBIRD\b|\bBIRDS\b|\bVASE\b|\bBOWL\b|\bSCULPTURE\b|\bHAND OPEN SHAPE\b"
     r"|\bBASE\b|\bHEARTS?\b|\bSTAR\b|\bCAT\b|\bDOG\b|\bRABBIT\b|\bHEN\b|\bPEARS\b|\bOWL\b|\bANIMAL\b"
     r"|\bBUNN(Y|IES)\b|\bSTONES\b|\bGEMS\b|\bHORSE\b|\bPIG\b|\bELEPHANT\b|\bDRAGONFLY\b|\bASHTRAY\b|\bPEGS?\b"
     r"|\bBUTTERFLY\b|\bFLOWER\b|\bDISCO BALL\b|\bGLOBE\b|\bSNOW ?GLOBE\b|\bTRINKET TREE\b|\bTREE\b|\bPINEAPPLE\b",
     H, "Ornaments & Figurines"),
]
_COMPILED = [(re.compile(rx), cat, sub) for rx, cat, sub in TAXONOMY_RULES]

for _rx, _cat, _sub in TAXONOMY_RULES:
    assert _sub in TAXONOMY.get(_cat, []), f"rule targets unknown {_cat} / {_sub}"


def clean_name(raw: str) -> str:
    name = " ".join(raw.replace("�", "£").split()).upper().lstrip("*").strip()
    name = name.rstrip(".,;:- ").strip()
    for rx, repl in NAME_FIXES:
        name = re.sub(rx, repl, name)
    return " ".join(name.split())


def classify(name: str) -> tuple[str, str] | None:
    for rx, cat, sub in _COMPILED:
        if rx.search(name):
            return cat, sub
    return None


def _norm(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


def product_text(name: str, category: str, subcategory: str) -> str:
    """Same construction as the original file: normalised name, category,
    subcategory, then the first colour word that appears in the name."""
    words = _norm(name).split()
    colour = next((w for w in words if w in COLOURS), "")
    return " ".join(x for x in [_norm(name), _norm(category), _norm(subcategory), colour] if x)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check_only = "--check" in sys.argv
    csv_path = os.path.abspath(args[0] if args else DEFAULT_CSV)

    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        rows = list(reader)
    print(f"Read {len(rows)} rows, {len(columns)} columns from {csv_path}")

    names = {}
    for r in rows:
        names.setdefault(r["product_id"], r["product_name"])

    labels, unmatched, dropped_products = {}, [], set()
    for pid, raw in names.items():
        name = clean_name(raw)
        if NON_MERCHANDISE.match(name):
            dropped_products.add(pid)
            continue
        result = classify(name)
        if result is None:
            unmatched.append(name)
        else:
            labels[pid] = (name, *result)

    if unmatched:
        print(f"ERROR: {len(unmatched)} products matched no taxonomy rule:")
        for n in sorted(unmatched):
            print("   ", n)
        sys.exit(1)

    earliest_date = {}
    for r in rows:
        if r["product_id"] in dropped_products:
            continue
        d = earliest_date.get(r["order_id"])
        if d is None or r["order_date"] < d:
            earliest_date[r["order_id"]] = r["order_date"]

    out, changed = [], Counter()
    for r in rows:
        if r["product_id"] in dropped_products:
            changed["rows dropped (non-merchandise)"] += 1
            continue
        name, cat, sub = labels[r["product_id"]]
        new = dict(r)
        new["product_name"] = name
        new["category"] = cat
        new["subcategory"] = sub
        new["product_text"] = product_text(name, cat, sub)
        new["country"] = COUNTRY_FIXES.get(r["country"].strip(), r["country"].strip())
        new["order_date"] = earliest_date[r["order_id"]]
        for col in ("product_name", "category", "subcategory", "product_text", "country", "order_date"):
            if new[col] != r[col]:
                changed[col] += 1
        out.append(new)

    per_sub = Counter((cat, sub) for _, cat, sub in labels.values())
    print(f"{len(labels)} products classified into {len({c for c, _ in per_sub})} categories / "
          f"{len(per_sub)} subcategories; {len(dropped_products)} non-merchandise products dropped.")
    for (cat, sub), n in sorted(per_sub.items()):
        print(f"  {cat:24} {sub:28} {n:5}")
    empty = [(c, s) for c, subs in TAXONOMY.items() for s in subs if (c, s) not in per_sub]
    if empty:
        print(f"WARNING: empty subcategories: {empty}")
    print("Changed values:", dict(changed))

    if check_only:
        return
    tmp = csv_path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(out)
    os.replace(tmp, csv_path)
    print(f"Wrote {len(out)} rows to {csv_path}")


if __name__ == "__main__":
    main()
