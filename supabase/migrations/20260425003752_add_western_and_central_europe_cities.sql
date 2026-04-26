/*
  # Mbulim i zgjeruar për qytetet e Evropës Qendrore dhe Perëndimore

  1. Ndryshime
    - Shton qytete të mëdha për Gjermani (DE), Austri (AT), Zvicër (CH)
    - Shton qytete për Francë (FR), Itali (IT), Spanjë (ES), Portugali (PT)
    - Shton qytete për Holandë (NL), Belgjikë (BE), Luksemburg (LU)
    - Shton qytete për MB (GB), Irlandë (IE), Poloni (PL), Çeki (CZ), Sllovaki (SK)
    - Shton qytete për Hungari (HU), Rumani (RO), Greqi (GR), Qipro (CY), Maltë (MT)
    - Shton qytete për Skandinavi (DK, SE, NO, FI, IS)
    - Shton qytete për Baltikë (EE, LV, LT), Ukrainë (UA), Moldavi (MD)
    - Shton qytete për Turqi (TR), Rusi (RU), Bjellorusi (BY)

  2. Siguria
    - Tabelat tashmë kanë RLS të aktivizuar; nuk shtohen politika

  3. Shënime
    - Idempotent: përdor `WHERE NOT EXISTS` për secilin rresht
*/

INSERT INTO cities (country_id, name, admin_area)
SELECT c.id, v.name, v.admin_area
FROM (VALUES
  -- Germany: shtete federale + qytete të mëdha shtesë
  ('DE','Dortmund','NRW'),('DE','Essen','NRW'),('DE','Leipzig','Sachsen'),
  ('DE','Bremen','Bremen'),('DE','Dresden','Sachsen'),('DE','Hannover','Niedersachsen'),
  ('DE','Nürnberg','Bayern'),('DE','Duisburg','NRW'),('DE','Bochum','NRW'),
  ('DE','Wuppertal','NRW'),('DE','Bielefeld','NRW'),('DE','Bonn','NRW'),
  ('DE','Münster','NRW'),('DE','Karlsruhe','BW'),('DE','Mannheim','BW'),
  ('DE','Augsburg','Bayern'),('DE','Wiesbaden','Hessen'),('DE','Gelsenkirchen','NRW'),
  ('DE','Mönchengladbach','NRW'),('DE','Braunschweig','Niedersachsen'),
  ('DE','Chemnitz','Sachsen'),('DE','Kiel','Schleswig-Holstein'),
  ('DE','Aachen','NRW'),('DE','Halle','Sachsen-Anhalt'),('DE','Magdeburg','Sachsen-Anhalt'),
  ('DE','Freiburg','BW'),('DE','Krefeld','NRW'),('DE','Lübeck','Schleswig-Holstein'),
  ('DE','Oberhausen','NRW'),('DE','Erfurt','Thüringen'),('DE','Mainz','Rheinland-Pfalz'),
  ('DE','Rostock','MV'),('DE','Kassel','Hessen'),('DE','Hagen','NRW'),
  ('DE','Saarbrücken','Saarland'),('DE','Potsdam','Brandenburg'),
  ('DE','Heidelberg','BW'),('DE','Regensburg','Bayern'),('DE','Ingolstadt','Bayern'),
  ('DE','Würzburg','Bayern'),('DE','Fürth','Bayern'),('DE','Ulm','BW'),
  ('DE','Heilbronn','BW'),('DE','Pforzheim','BW'),('DE','Göttingen','Niedersachsen'),
  ('DE','Bottrop','NRW'),('DE','Trier','Rheinland-Pfalz'),('DE','Recklinghausen','NRW'),
  ('DE','Reutlingen','BW'),('DE','Bremerhaven','Bremen'),('DE','Koblenz','Rheinland-Pfalz'),
  ('DE','Jena','Thüringen'),('DE','Remscheid','NRW'),('DE','Erlangen','Bayern'),
  ('DE','Moers','NRW'),('DE','Siegen','NRW'),('DE','Hildesheim','Niedersachsen'),
  ('DE','Salzgitter','Niedersachsen'),('DE','Offenbach','Hessen'),('DE','Cottbus','Brandenburg'),
  ('DE','Paderborn','NRW'),('DE','Gladbeck','NRW'),('DE','Osnabrück','Niedersachsen'),
  ('DE','Solingen','NRW'),('DE','Ludwigshafen','Rheinland-Pfalz'),('DE','Oldenburg','Niedersachsen'),

  -- Austria
  ('AT','Villach','Kärnten'),('AT','Wels','Oberösterreich'),('AT','Sankt Pölten','Niederösterreich'),
  ('AT','Dornbirn','Vorarlberg'),('AT','Wiener Neustadt','Niederösterreich'),
  ('AT','Steyr','Oberösterreich'),('AT','Feldkirch','Vorarlberg'),('AT','Bregenz','Vorarlberg'),
  ('AT','Leonding','Oberösterreich'),('AT','Klosterneuburg','Niederösterreich'),
  ('AT','Baden','Niederösterreich'),('AT','Wolfsberg','Kärnten'),('AT','Leoben','Steiermark'),
  ('AT','Krems','Niederösterreich'),('AT','Traun','Oberösterreich'),('AT','Amstetten','Niederösterreich'),
  ('AT','Kapfenberg','Steiermark'),('AT','Lustenau','Vorarlberg'),('AT','Mödling','Niederösterreich'),

  -- Switzerland
  ('CH','Winterthur','Zürich'),('CH','Lucerne','Luzern'),('CH','St. Gallen','St. Gallen'),
  ('CH','Lugano','Ticino'),('CH','Biel/Bienne','Bern'),('CH','Thun','Bern'),
  ('CH','Schaffhausen','Schaffhausen'),('CH','Fribourg','Fribourg'),('CH','Chur','Graubünden'),
  ('CH','Neuchâtel','Neuchâtel'),('CH','Sion','Valais'),('CH','La Chaux-de-Fonds','Neuchâtel'),
  ('CH','Uster','Zürich'),('CH','Zug','Zug'),('CH','Locarno','Ticino'),('CH','Bellinzona','Ticino'),
  ('CH','Rapperswil-Jona','St. Gallen'),('CH','Montreux','Vaud'),('CH','Aarau','Aargau'),

  -- France
  ('FR','Strasbourg','Grand Est'),('FR','Nantes','Pays de la Loire'),('FR','Montpellier','Occitanie'),
  ('FR','Lille','Hauts-de-France'),('FR','Rennes','Bretagne'),('FR','Reims','Grand Est'),
  ('FR','Le Havre','Normandie'),('FR','Saint-Étienne','Auvergne-Rhône-Alpes'),
  ('FR','Toulon','PACA'),('FR','Grenoble','Auvergne-Rhône-Alpes'),('FR','Dijon','Bourgogne-Franche-Comté'),
  ('FR','Angers','Pays de la Loire'),('FR','Nîmes','Occitanie'),('FR','Villeurbanne','Auvergne-Rhône-Alpes'),
  ('FR','Clermont-Ferrand','Auvergne-Rhône-Alpes'),('FR','Le Mans','Pays de la Loire'),
  ('FR','Aix-en-Provence','PACA'),('FR','Brest','Bretagne'),('FR','Tours','Centre-Val de Loire'),
  ('FR','Amiens','Hauts-de-France'),('FR','Limoges','Nouvelle-Aquitaine'),
  ('FR','Annecy','Auvergne-Rhône-Alpes'),('FR','Perpignan','Occitanie'),('FR','Besançon','Bourgogne-Franche-Comté'),
  ('FR','Orléans','Centre-Val de Loire'),('FR','Metz','Grand Est'),('FR','Rouen','Normandie'),
  ('FR','Mulhouse','Grand Est'),('FR','Caen','Normandie'),('FR','Nancy','Grand Est'),
  ('FR','Tourcoing','Hauts-de-France'),('FR','Roubaix','Hauts-de-France'),('FR','Pau','Nouvelle-Aquitaine'),
  ('FR','Avignon','PACA'),('FR','La Rochelle','Nouvelle-Aquitaine'),('FR','Calais','Hauts-de-France'),
  ('FR','Cannes','PACA'),('FR','Ajaccio','Corse'),('FR','Bastia','Corse'),

  -- Italy
  ('IT','Bologna','Emilia-Romagna'),('IT','Florence','Toscana'),('IT','Bari','Puglia'),
  ('IT','Catania','Sicilia'),('IT','Venice','Veneto'),('IT','Verona','Veneto'),
  ('IT','Messina','Sicilia'),('IT','Padova','Veneto'),('IT','Trieste','Friuli-V.G.'),
  ('IT','Taranto','Puglia'),('IT','Brescia','Lombardia'),('IT','Reggio Calabria','Calabria'),
  ('IT','Modena','Emilia-Romagna'),('IT','Prato','Toscana'),('IT','Parma','Emilia-Romagna'),
  ('IT','Cagliari','Sardegna'),('IT','Livorno','Toscana'),('IT','Foggia','Puglia'),
  ('IT','Reggio Emilia','Emilia-Romagna'),('IT','Ravenna','Emilia-Romagna'),('IT','Rimini','Emilia-Romagna'),
  ('IT','Salerno','Campania'),('IT','Ferrara','Emilia-Romagna'),('IT','Sassari','Sardegna'),
  ('IT','Monza','Lombardia'),('IT','Bergamo','Lombardia'),('IT','Siracusa','Sicilia'),
  ('IT','Pescara','Abruzzo'),('IT','Latina','Lazio'),('IT','Vicenza','Veneto'),
  ('IT','Terni','Umbria'),('IT','Novara','Piemonte'),('IT','Ancona','Marche'),
  ('IT','Udine','Friuli-V.G.'),('IT','Arezzo','Toscana'),('IT','Cesena','Emilia-Romagna'),
  ('IT','Lecce','Puglia'),('IT','Pesaro','Marche'),('IT','Como','Lombardia'),
  ('IT','La Spezia','Liguria'),('IT','Perugia','Umbria'),('IT','Lucca','Toscana'),
  ('IT','Pisa','Toscana'),('IT','Bolzano','Trentino-AA'),('IT','Trento','Trentino-AA'),

  -- Spain
  ('ES','Zaragoza','Aragón'),('ES','Málaga','Andalucía'),('ES','Murcia','Murcia'),
  ('ES','Palma','Illes Balears'),('ES','Las Palmas','Canarias'),('ES','Bilbao','País Vasco'),
  ('ES','Alicante','Valencia'),('ES','Córdoba','Andalucía'),('ES','Valladolid','Castilla y León'),
  ('ES','Vigo','Galicia'),('ES','Gijón','Asturias'),('ES','Granada','Andalucía'),
  ('ES','A Coruña','Galicia'),('ES','Vitoria','País Vasco'),('ES','Santa Cruz de Tenerife','Canarias'),
  ('ES','Oviedo','Asturias'),('ES','Pamplona','Navarra'),('ES','Cartagena','Murcia'),
  ('ES','Almería','Andalucía'),('ES','Castellón','Valencia'),('ES','Santander','Cantabria'),
  ('ES','Burgos','Castilla y León'),('ES','Salamanca','Castilla y León'),('ES','Huelva','Andalucía'),
  ('ES','Logroño','La Rioja'),('ES','Badajoz','Extremadura'),('ES','San Sebastián','País Vasco'),
  ('ES','León','Castilla y León'),('ES','Tarragona','Cataluña'),('ES','Cádiz','Andalucía'),
  ('ES','Jaén','Andalucía'),('ES','Ourense','Galicia'),('ES','Girona','Cataluña'),

  -- Portugal
  ('PT','Lisbon','Lisboa'),('PT','Porto','Porto'),('PT','Braga','Braga'),
  ('PT','Coimbra','Coimbra'),('PT','Funchal','Madeira'),('PT','Aveiro','Aveiro'),
  ('PT','Faro','Algarve'),('PT','Viseu','Viseu'),('PT','Leiria','Leiria'),
  ('PT','Setúbal','Setúbal'),('PT','Évora','Évora'),('PT','Guimarães','Braga'),
  ('PT','Viana do Castelo','Viana do Castelo'),('PT','Bragança','Bragança'),

  -- Netherlands
  ('NL','Eindhoven','Noord-Brabant'),('NL','Groningen','Groningen'),('NL','Tilburg','Noord-Brabant'),
  ('NL','Almere','Flevoland'),('NL','Breda','Noord-Brabant'),('NL','Nijmegen','Gelderland'),
  ('NL','Apeldoorn','Gelderland'),('NL','Haarlem','Noord-Holland'),('NL','Arnhem','Gelderland'),
  ('NL','Enschede','Overijssel'),('NL','Amersfoort','Utrecht'),('NL','Zaanstad','Noord-Holland'),
  ('NL','Zwolle','Overijssel'),('NL','Leiden','Zuid-Holland'),('NL','Maastricht','Limburg'),
  ('NL','Dordrecht','Zuid-Holland'),('NL','Leeuwarden','Friesland'),('NL','Delft','Zuid-Holland'),
  ('NL','Alkmaar','Noord-Holland'),

  -- Belgium
  ('BE','Liège','Wallonia'),('BE','Namur','Wallonia'),('BE','Mons','Wallonia'),
  ('BE','Leuven','Flanders'),('BE','Mechelen','Flanders'),('BE','Aalst','Flanders'),
  ('BE','Hasselt','Flanders'),('BE','Kortrijk','Flanders'),('BE','Ostend','Flanders'),
  ('BE','Tournai','Wallonia'),('BE','Genk','Flanders'),('BE','Roeselare','Flanders'),
  ('BE','Sint-Niklaas','Flanders'),('BE','Charleroi','Wallonia'),

  -- Luxembourg
  ('LU','Esch-sur-Alzette','Esch'),('LU','Differdange','Esch'),('LU','Dudelange','Esch'),
  ('LU','Ettelbruck','Diekirch'),('LU','Diekirch','Diekirch'),('LU','Wiltz','Diekirch'),

  -- United Kingdom
  ('GB','Birmingham','England'),('GB','Leeds','England'),('GB','Glasgow','Scotland'),
  ('GB','Liverpool','England'),('GB','Newcastle','England'),('GB','Sheffield','England'),
  ('GB','Bristol','England'),('GB','Belfast','Northern Ireland'),('GB','Leicester','England'),
  ('GB','Nottingham','England'),('GB','Cardiff','Wales'),('GB','Coventry','England'),
  ('GB','Bradford','England'),('GB','Stoke-on-Trent','England'),('GB','Wolverhampton','England'),
  ('GB','Plymouth','England'),('GB','Derby','England'),('GB','Southampton','England'),
  ('GB','Portsmouth','England'),('GB','Aberdeen','Scotland'),('GB','Brighton','England'),
  ('GB','Oxford','England'),('GB','Cambridge','England'),('GB','York','England'),
  ('GB','Dundee','Scotland'),('GB','Swansea','Wales'),('GB','Reading','England'),
  ('GB','Norwich','England'),('GB','Hull','England'),('GB','Exeter','England'),

  -- Ireland
  ('IE','Cork','Munster'),('IE','Galway','Connacht'),('IE','Limerick','Munster'),
  ('IE','Waterford','Munster'),('IE','Kilkenny','Leinster'),('IE','Sligo','Connacht'),
  ('IE','Drogheda','Leinster'),('IE','Dundalk','Leinster'),('IE','Bray','Leinster'),

  -- Poland
  ('PL','Łódź','Łódź'),('PL','Wrocław','Lower Silesia'),('PL','Poznań','Greater Poland'),
  ('PL','Gdańsk','Pomerania'),('PL','Szczecin','West Pomerania'),('PL','Bydgoszcz','Kuyavia-Pomerania'),
  ('PL','Lublin','Lublin'),('PL','Białystok','Podlaskie'),('PL','Katowice','Silesia'),
  ('PL','Gdynia','Pomerania'),('PL','Częstochowa','Silesia'),('PL','Radom','Masovia'),
  ('PL','Sosnowiec','Silesia'),('PL','Toruń','Kuyavia-Pomerania'),('PL','Kielce','Świętokrzyskie'),
  ('PL','Rzeszów','Subcarpathia'),('PL','Gliwice','Silesia'),('PL','Zabrze','Silesia'),
  ('PL','Olsztyn','Warmia-Masuria'),('PL','Bielsko-Biała','Silesia'),('PL','Opole','Opole'),
  ('PL','Zielona Góra','Lubusz'),('PL','Płock','Masovia'),('PL','Elbląg','Warmia-Masuria'),

  -- Czech Republic
  ('CZ','Brno','South Moravia'),('CZ','Ostrava','Moravia-Silesia'),('CZ','Plzeň','Plzeň'),
  ('CZ','Liberec','Liberec'),('CZ','Olomouc','Olomouc'),('CZ','Hradec Králové','Hradec Králové'),
  ('CZ','České Budějovice','South Bohemia'),('CZ','Pardubice','Pardubice'),('CZ','Ústí nad Labem','Ústí'),
  ('CZ','Zlín','Zlín'),('CZ','Karlovy Vary','Karlovy Vary'),('CZ','Jihlava','Vysočina'),

  -- Slovakia
  ('SK','Košice','Košice'),('SK','Prešov','Prešov'),('SK','Žilina','Žilina'),
  ('SK','Banská Bystrica','Banská Bystrica'),('SK','Nitra','Nitra'),('SK','Trnava','Trnava'),
  ('SK','Trenčín','Trenčín'),('SK','Martin','Žilina'),('SK','Poprad','Prešov'),
  ('SK','Prievidza','Trenčín'),('SK','Zvolen','Banská Bystrica'),

  -- Hungary
  ('HU','Debrecen','Hajdú-Bihar'),('HU','Szeged','Csongrád-Csanád'),('HU','Miskolc','Borsod'),
  ('HU','Pécs','Baranya'),('HU','Győr','Győr-Moson-Sopron'),('HU','Nyíregyháza','Szabolcs'),
  ('HU','Kecskemét','Bács-Kiskun'),('HU','Székesfehérvár','Fejér'),('HU','Szombathely','Vas'),
  ('HU','Szolnok','Jász-Nagykun-Szolnok'),('HU','Tatabánya','Komárom'),('HU','Kaposvár','Somogy'),
  ('HU','Érd','Pest'),('HU','Veszprém','Veszprém'),('HU','Sopron','Győr-Moson-Sopron'),

  -- Romania
  ('RO','Cluj-Napoca','Cluj'),('RO','Timișoara','Timiș'),('RO','Iași','Iași'),
  ('RO','Constanța','Constanța'),('RO','Craiova','Dolj'),('RO','Brașov','Brașov'),
  ('RO','Galați','Galați'),('RO','Ploiești','Prahova'),('RO','Oradea','Bihor'),
  ('RO','Brăila','Brăila'),('RO','Arad','Arad'),('RO','Pitești','Argeș'),
  ('RO','Sibiu','Sibiu'),('RO','Bacău','Bacău'),('RO','Târgu Mureș','Mureș'),
  ('RO','Baia Mare','Maramureș'),('RO','Buzău','Buzău'),('RO','Botoșani','Botoșani'),
  ('RO','Satu Mare','Satu Mare'),('RO','Râmnicu Vâlcea','Vâlcea'),('RO','Suceava','Suceava'),
  ('RO','Piatra Neamț','Neamț'),('RO','Drobeta-Turnu Severin','Mehedinți'),('RO','Târgu Jiu','Gorj'),

  -- Greece
  ('GR','Patras','Western Greece'),('GR','Heraklion','Crete'),('GR','Larissa','Thessaly'),
  ('GR','Volos','Thessaly'),('GR','Ioannina','Epirus'),('GR','Chania','Crete'),
  ('GR','Kavala','East Macedonia'),('GR','Rhodes','South Aegean'),('GR','Kalamata','Peloponnese'),
  ('GR','Serres','Central Macedonia'),('GR','Alexandroupoli','East Macedonia'),('GR','Trikala','Thessaly'),
  ('GR','Corfu','Ionian'),('GR','Xanthi','East Macedonia'),('GR','Katerini','Central Macedonia'),

  -- Cyprus
  ('CY','Larnaca','Larnaca'),('CY','Paphos','Paphos'),('CY','Famagusta','Famagusta'),
  ('CY','Kyrenia','Kyrenia'),

  -- Malta
  ('MT','Sliema','Malta'),('MT','St. Julian''s','Malta'),('MT','Mdina','Malta'),
  ('MT','Gozo','Gozo'),('MT','Marsa','Malta'),('MT','Rabat','Malta'),

  -- Denmark
  ('DK','Odense','South Denmark'),('DK','Esbjerg','South Denmark'),('DK','Randers','Mid Jutland'),
  ('DK','Kolding','South Denmark'),('DK','Vejle','South Denmark'),('DK','Horsens','Mid Jutland'),
  ('DK','Helsingør','Capital Region'),('DK','Roskilde','Zealand'),('DK','Herning','Mid Jutland'),

  -- Sweden
  ('SE','Uppsala','Uppsala'),('SE','Västerås','Västmanland'),('SE','Örebro','Örebro'),
  ('SE','Linköping','Östergötland'),('SE','Helsingborg','Skåne'),('SE','Jönköping','Jönköping'),
  ('SE','Norrköping','Östergötland'),('SE','Lund','Skåne'),('SE','Umeå','Västerbotten'),
  ('SE','Gävle','Gävleborg'),('SE','Borås','Västra Götaland'),('SE','Eskilstuna','Södermanland'),
  ('SE','Halmstad','Halland'),('SE','Växjö','Kronoberg'),('SE','Kalmar','Kalmar'),

  -- Norway
  ('NO','Trondheim','Trøndelag'),('NO','Stavanger','Rogaland'),('NO','Kristiansand','Agder'),
  ('NO','Drammen','Viken'),('NO','Fredrikstad','Viken'),('NO','Tromsø','Troms'),
  ('NO','Sandnes','Rogaland'),('NO','Bodø','Nordland'),('NO','Ålesund','Møre og Romsdal'),

  -- Finland
  ('FI','Espoo','Uusimaa'),('FI','Tampere','Pirkanmaa'),('FI','Vantaa','Uusimaa'),
  ('FI','Oulu','North Ostrobothnia'),('FI','Turku','Southwest Finland'),('FI','Jyväskylä','Central Finland'),
  ('FI','Lahti','Päijät-Häme'),('FI','Kuopio','North Savonia'),('FI','Pori','Satakunta'),
  ('FI','Joensuu','North Karelia'),('FI','Rovaniemi','Lapland'),

  -- Iceland
  ('IS','Kópavogur','Capital'),('IS','Hafnarfjörður','Capital'),('IS','Akureyri','Northeast'),
  ('IS','Reykjanesbær','Southern Peninsula'),('IS','Garðabær','Capital'),('IS','Mosfellsbær','Capital'),

  -- Estonia
  ('EE','Narva','Ida-Viru'),('EE','Pärnu','Pärnu'),('EE','Kohtla-Järve','Ida-Viru'),
  ('EE','Viljandi','Viljandi'),('EE','Rakvere','Lääne-Viru'),('EE','Kuressaare','Saare'),

  -- Latvia
  ('LV','Daugavpils','Latgale'),('LV','Liepāja','Kurzeme'),('LV','Jelgava','Zemgale'),
  ('LV','Jūrmala','Riga'),('LV','Ventspils','Kurzeme'),('LV','Rēzekne','Latgale'),

  -- Lithuania
  ('LT','Klaipėda','Klaipėda'),('LT','Šiauliai','Šiauliai'),('LT','Panevėžys','Panevėžys'),
  ('LT','Alytus','Alytus'),('LT','Marijampolė','Marijampolė'),('LT','Mažeikiai','Telšiai'),

  -- Ukraine
  ('UA','Kharkiv','Kharkiv'),('UA','Dnipro','Dnipropetrovsk'),('UA','Odesa','Odesa'),
  ('UA','Donetsk','Donetsk'),('UA','Zaporizhzhia','Zaporizhzhia'),('UA','Kryvyi Rih','Dnipropetrovsk'),
  ('UA','Mykolaiv','Mykolaiv'),('UA','Mariupol','Donetsk'),('UA','Luhansk','Luhansk'),
  ('UA','Vinnytsia','Vinnytsia'),('UA','Simferopol','Crimea'),('UA','Poltava','Poltava'),
  ('UA','Chernihiv','Chernihiv'),('UA','Cherkasy','Cherkasy'),('UA','Khmelnytskyi','Khmelnytskyi'),
  ('UA','Zhytomyr','Zhytomyr'),('UA','Sumy','Sumy'),('UA','Rivne','Rivne'),
  ('UA','Ivano-Frankivsk','Ivano-Frankivsk'),('UA','Ternopil','Ternopil'),('UA','Uzhhorod','Zakarpattia'),

  -- Moldova
  ('MD','Bălți','North'),('MD','Cahul','South'),('MD','Tiraspol','Transnistria'),
  ('MD','Tighina','Transnistria'),('MD','Ungheni','Center'),('MD','Orhei','Center'),
  ('MD','Soroca','North'),('MD','Comrat','Gagauzia'),

  -- Belarus
  ('BY','Brest','Brest'),('BY','Gomel','Gomel'),('BY','Vitebsk','Vitebsk'),
  ('BY','Grodno','Grodno'),('BY','Mogilev','Mogilev'),('BY','Bobruysk','Mogilev'),

  -- Russia (major west-of-Urals)
  ('RU','Novosibirsk','Novosibirsk'),('RU','Yekaterinburg','Sverdlovsk'),('RU','Nizhny Novgorod','Nizhny Novgorod'),
  ('RU','Samara','Samara'),('RU','Kazan','Tatarstan'),('RU','Chelyabinsk','Chelyabinsk'),
  ('RU','Omsk','Omsk'),('RU','Rostov-on-Don','Rostov'),('RU','Ufa','Bashkortostan'),
  ('RU','Volgograd','Volgograd'),('RU','Perm','Perm'),('RU','Krasnoyarsk','Krasnoyarsk'),
  ('RU','Voronezh','Voronezh'),('RU','Saratov','Saratov'),('RU','Krasnodar','Krasnodar'),
  ('RU','Tolyatti','Samara'),('RU','Izhevsk','Udmurtia'),('RU','Ulyanovsk','Ulyanovsk'),
  ('RU','Yaroslavl','Yaroslavl'),('RU','Tula','Tula'),('RU','Kaliningrad','Kaliningrad'),

  -- Turkey
  ('TR','Ankara','Ankara'),('TR','Izmir','Izmir'),('TR','Bursa','Bursa'),
  ('TR','Adana','Adana'),('TR','Gaziantep','Gaziantep'),('TR','Konya','Konya'),
  ('TR','Antalya','Antalya'),('TR','Kayseri','Kayseri'),('TR','Mersin','Mersin'),
  ('TR','Eskişehir','Eskişehir'),('TR','Diyarbakır','Diyarbakır'),('TR','Samsun','Samsun'),
  ('TR','Denizli','Denizli'),('TR','Şanlıurfa','Şanlıurfa'),('TR','Malatya','Malatya'),
  ('TR','Trabzon','Trabzon'),('TR','Erzurum','Erzurum'),('TR','Van','Van'),
  ('TR','Sakarya','Sakarya'),('TR','Kocaeli','Kocaeli'),('TR','Edirne','Edirne'),
  ('TR','Çanakkale','Çanakkale'),('TR','Mardin','Mardin')
) AS v(country_code, name, admin_area)
JOIN countries c ON upper(c.code) = upper(v.country_code)
WHERE NOT EXISTS (
  SELECT 1 FROM cities ci
  WHERE ci.country_id = c.id
    AND lower(ci.name) = lower(v.name)
);
