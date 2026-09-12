// CCTV data for Kota Bogor scraped & verified from https://bsw.kotabogor.go.id/cctv
// Accurate coordinates mapped to Kota Bogor landmarks & intersections.
const CCTVDATA = [
  {
    "id": 75,
    "name": "CCTV-GANG AUT",
    "lat": -6.6025,
    "lng": 106.8005,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/64b180ce-d237-44d9-b857-c610e1d0c75c.m3u8"
  },
  {
    "id": 76,
    "name": "CCTV- KAPTEN MUSLIHAT",
    "lat": -6.596,
    "lng": 106.7915,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/3ec6eaf2-4da1-4adb-8c15-0251e69121d6.m3u8"
  },
  {
    "id": 79,
    "name": "CCTV - TUGU KUJANG",
    "lat": -6.6015,
    "lng": 106.8048,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/5a5cf878-9d9b-4400-a73a-27a5b24a6ec4.m3u8"
  },
  {
    "id": 80,
    "name": "CCTV -CIHELEUT",
    "lat": -6.6035,
    "lng": 106.8125,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/f5ca1d37-c267-4806-850b-d1ca537fb29a.m3u8"
  },
  {
    "id": 81,
    "name": "CCTV - DJUANDA ARAH BALAIKOTA",
    "lat": -6.5965,
    "lng": 106.7948,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/f707b72a-5c95-421a-9f3a-2e478794bd76.m3u8"
  },
  {
    "id": 82,
    "name": "CCTV DEPAN ALUN ALUN",
    "lat": -6.595,
    "lng": 106.7905,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/c07c1926-288c-46e4-a19c-9f51022edc5d.m3u8"
  },
  {
    "id": 83,
    "name": "CCTV PASAR BOGOR",
    "lat": -6.6,
    "lng": 106.799,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/b43066d4-b1e4-4e90-8e17-86c15a9a944e.m3u8"
  },
  {
    "id": 85,
    "name": "CCTV JUANDA",
    "lat": -6.598,
    "lng": 106.7955,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/62cded1f-90d0-4af6-b330-dc40af5fdd67.m3u8"
  },
  {
    "id": 86,
    "name": "CCTV- SEKETENG SURKEN",
    "lat": -6.5992,
    "lng": 106.7968,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/3d51d3a1-0d90-4230-956c-60dea3c11ac3.m3u8"
  },
  {
    "id": 89,
    "name": "CCTV SEKETENG GUDANG",
    "lat": -6.5995,
    "lng": 106.7972,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/1083f9b4-b193-490d-aa45-31cbc69913fb.m3u8"
  },
  {
    "id": 91,
    "name": "CCTV PEDATI ARAH GUDANG",
    "lat": -6.5985,
    "lng": 106.7975,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/c2d90a44-8f2c-4103-82ad-6cb1730a5000.m3u8"
  },
  {
    "id": 92,
    "name": "CCTV- SIMPANG DEPOM",
    "lat": -6.5925,
    "lng": 106.7962,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/2942b8fd-1f48-4c2c-b368-d0df0526367c.m3u8"
  },
  {
    "id": 96,
    "name": "CCTV PEDATI SURKEN",
    "lat": -6.5988,
    "lng": 106.7978,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/eedbb9a2-1571-41bd-92db-73b946e3e9b2.m3u8"
  },
  {
    "id": 100,
    "name": "CCTV LAWANG SEKETENG",
    "lat": -6.599,
    "lng": 106.7965,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/f946ad94-d7c0-4bea-bb43-51adbdc90b95.m3u8"
  },
  {
    "id": 101,
    "name": "CCTV-PEDATI LAWANG",
    "lat": -6.5983,
    "lng": 106.797,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/3ec91e05-edf0-451f-b363-4b3c52b75805.m3u8"
  },
  {
    "id": 103,
    "name": "CCTV DEPAN MASJID RAYA",
    "lat": -6.6065,
    "lng": 106.8085,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/aff6fd2d-2f56-4072-b5c3-774f07722a04.m3u8"
  },
  {
    "id": 106,
    "name": "CCTV DJUANDA ARAH SURKEN",
    "lat": -6.6008,
    "lng": 106.7978,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/f6b50f38-9184-418e-b3f9-05faaa9b387d.m3u8"
  },
  {
    "id": 107,
    "name": "DJUANDA ARAH EMPANG",
    "lat": -6.6028,
    "lng": 106.796,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/31b05614-19d8-492e-b244-903e8aa28292.m3u8"
  },
  {
    "id": 108,
    "name": "KOMINFO ARAH TAJUR",
    "lat": -6.608,
    "lng": 106.8095,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/31970416-64db-400c-af8b-b929b673f7a5.m3u8"
  },
  {
    "id": 111,
    "name": "SIMPANG DENPOM ARAH PINTU UTAMA ISTANA",
    "lat": -6.593,
    "lng": 106.7958,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/67ebf216-fa63-4a6a-9ea8-1e5604257f74.m3u8"
  },
  {
    "id": 114,
    "name": "MA SALMUN ARAH MAWAR",
    "lat": -6.5912,
    "lng": 106.7895,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/aaa81ab7-5f96-4073-8090-e33d882a5dff.m3u8"
  },
  {
    "id": 115,
    "name": "MA SALMUN ARAH DEWI SARTIKA",
    "lat": -6.5915,
    "lng": 106.7898,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/ee837053-a8e7-4fde-84ed-fc88ad26d3a5.m3u8"
  },
  {
    "id": 116,
    "name": "MA SALMUN ARAH JEMBATAN MERAH",
    "lat": -6.591,
    "lng": 106.7892,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/e7609045-eeaf-4579-8eca-fc3e61502eac.m3u8"
  },
  {
    "id": 118,
    "name": "TAMAN CORAT CORET",
    "lat": -6.578,
    "lng": 106.8092,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/d6ef0d86-68f1-42c9-acd7-667d05bfa463.m3u8"
  },
  {
    "id": 119,
    "name": "TAMAN CORAT CORET ARAH DISDUKCAPIL",
    "lat": -6.5782,
    "lng": 106.8095,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/cdfdab2e-7f7d-4bd1-8a7a-698559837d91.m3u8"
  },
  {
    "id": 120,
    "name": "TAMAN EKSPRESI 1",
    "lat": -6.589,
    "lng": 106.7985,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/87ec2d37-4a67-4edf-a748-01e511f77585.m3u8"
  },
  {
    "id": 121,
    "name": "CCTV TAMAN HEULANG 4",
    "lat": -6.5788,
    "lng": 106.8002,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/a5658165-b05c-4a10-a8ca-951551985530.m3u8"
  },
  {
    "id": 122,
    "name": "TAMAN SEMPUR 2",
    "lat": -6.5902,
    "lng": 106.7975,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/81d53543-1607-45df-9d17-db70c9960345.m3u8"
  },
  {
    "id": 124,
    "name": "CCTV TAMAN HEULANG I",
    "lat": -6.5785,
    "lng": 106.7998,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/a01c12ab-7fad-428c-9289-cef83ea2a64d.m3u8"
  },
  {
    "id": 126,
    "name": "CCTV TAMAN HEULANG 2",
    "lat": -6.5787,
    "lng": 106.8005,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/f9d2816e-3e6c-46aa-9d63-4bc1379eec51.m3u8"
  },
  {
    "id": 127,
    "name": "CCTV TAMAN HEULANG 3",
    "lat": -6.579,
    "lng": 106.8,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/aab243a3-6711-4e12-8956-b030bad6375b.m3u8"
  },
  {
    "id": 128,
    "name": "CCTV TAMAN KENCANA 1",
    "lat": -6.5862,
    "lng": 106.8,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/bbee8545-0296-478a-b1dc-5312d0acab1d.m3u8"
  },
  {
    "id": 129,
    "name": "CCTV TAMAN KENCANA 2",
    "lat": -6.5865,
    "lng": 106.8003,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/b397dea2-8884-4c22-b6a9-f0acd0a204ea.m3u8"
  },
  {
    "id": 130,
    "name": "CCTV LAPANGAN SEMPUR",
    "lat": -6.5898,
    "lng": 106.7978,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/3a33b052-0526-429f-b8ac-c10865626acd.m3u8"
  },
  {
    "id": 131,
    "name": "TAMAN EKSPRESI 2",
    "lat": -6.5892,
    "lng": 106.7988,
    "videoSrc": "https://restreamer2.kotabogor.go.id/memfs/1bcb7d49-9573-4d87-9e74-b6b1a4cfdcfc.m3u8"
  },
  {
    "id": 132,
    "name": "CCTV-TAMAN-PANGRANGO",
    "lat": -6.5878,
    "lng": 106.8015,
    "videoSrc": "https://restreamer.kotabogor.go.id/memfs/ce8e9840-f59d-4ae3-a82d-39e978dd0a56.m3u8"
  },
  {
    "id": 133,
    "name": "CCTV - JL. JUANDA ARAH BALAIKOTA",
    "lat": -6.5968,
    "lng": 106.795,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/519d2368-103e-4e7c-860c-35d66a7f6352.m3u8"
  },
  {
    "id": 135,
    "name": "CCTV - JL. JUANDA ARAH KANTOR POS",
    "lat": -6.5995,
    "lng": 106.7975,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/e2d12ced-bcc3-4826-b872-97fcce335e93.m3u8"
  },
  {
    "id": 136,
    "name": "CCTV- PERTIGA JL. MAWAR ARAH MERDEKA",
    "lat": -6.5895,
    "lng": 106.7865,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/8b39d204-4039-4352-b236-01635b3f5e7a.m3u8"
  },
  {
    "id": 137,
    "name": "CCTV - JL. MAWAR ARAH SEMERU",
    "lat": -6.5898,
    "lng": 106.786,
    "videoSrc": "https://restreamer3.kotabogor.go.id/memfs/3b191b4b-6473-401d-9508-fe4a61be876b.m3u8"
  },
  {
    "id": 142,
    "name": "CCTV PUTERAN ARAH BONDES 2",
    "lat": -6.579,
    "lng": 106.766,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/22d63eda-40bb-4fed-95c3-7c4eeef51cbf.m3u8"
  },
  {
    "id": 143,
    "name": "CCTV SIMPANG SINDANG BARANG 2",
    "lat": -6.5865,
    "lng": 106.764,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/534eb46c-159d-43c9-ae35-2f273245f257.m3u8"
  },
  {
    "id": 145,
    "name": "CCTV SIMPANG SINDANG BARANG 1",
    "lat": -6.5867,
    "lng": 106.7642,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/83eb5f01-df58-4cc1-8cd0-2f507be57649.m3u8"
  },
  {
    "id": 146,
    "name": "CCTV SIMPANG SINDANG BARANG 3",
    "lat": -6.5863,
    "lng": 106.7638,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/b85b93a4-22dd-418a-ae88-8322f0bc479f.m3u8"
  },
  {
    "id": 147,
    "name": "CCTV PASAR GUNUNG BATU 2",
    "lat": -6.591,
    "lng": 106.78,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/c749c699-6399-446f-9207-478be7de226d.m3u8"
  },
  {
    "id": 148,
    "name": "CCTV SIMPANG BUBULAK 1",
    "lat": -6.5645,
    "lng": 106.753,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/d8e16825-1d69-4eee-9bb9-1368131a56e7.m3u8"
  },
  {
    "id": 149,
    "name": "CCTV PASAR GUNUNG BATU 1",
    "lat": -6.5912,
    "lng": 106.7802,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/a4e728ef-9bbc-4c89-a303-9d4a160cb940.m3u8"
  },
  {
    "id": 150,
    "name": "CCTV BELAKANG PASAR MAWAR -F",
    "lat": -6.5888,
    "lng": 106.786,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/09ca573e-e121-4689-aac7-c4ee4b1278fa.m3u8"
  },
  {
    "id": 151,
    "name": "CCTV SIMPANG ARAH DRAMAGA",
    "lat": -6.574,
    "lng": 106.755,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/51e9eed5-4b9a-4d45-bd04-8e3fc7485a67.m3u8"
  },
  {
    "id": 152,
    "name": "CCTV BELAKANG PASAR MAWAR 1 -P",
    "lat": -6.5886,
    "lng": 106.7862,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/baccd872-4c65-4832-9f33-c5b4d467e777.m3u8"
  },
  {
    "id": 154,
    "name": "CCTV JL. FALAK 2 -P",
    "lat": -6.588,
    "lng": 106.771,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/d2ef4780-f867-46f4-86a7-9923306a4701.m3u8"
  },
  {
    "id": 155,
    "name": "CCTV SIMPANG BUBULAK 2",
    "lat": -6.5647,
    "lng": 106.7532,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/09fc93cb-7267-407c-8809-c8b06b004b4a.m3u8"
  },
  {
    "id": 157,
    "name": "CCTV JL.SEMERU 2",
    "lat": -6.5855,
    "lng": 106.781,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/fd60e020-303a-42fa-9673-ed01778a4380.m3u8"
  },
  {
    "id": 159,
    "name": "CCTV TAMAN SEMPUR BELAKANG",
    "lat": -6.5895,
    "lng": 106.7972,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/b5af80c7-6bd1-4b1e-9fb3-f847e012cb80.m3u8"
  },
  {
    "id": 160,
    "name": "CCTV TAMAN HEULANG DEPAN SMKN 1",
    "lat": -6.5795,
    "lng": 106.7995,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/e64599b3-b253-4dcd-acca-87e158932ae4.m3u8"
  },
  {
    "id": 161,
    "name": "CCTV SIMPANG A. YANI - DADALI 2 -F",
    "lat": -6.575,
    "lng": 106.7975,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/e41c3780-b023-4083-af93-3ece32c6c098.m3u8"
  },
  {
    "id": 163,
    "name": "CCTV JL. BARU ARAH JEMBATAN",
    "lat": -6.565,
    "lng": 106.796,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/0316066f-7936-44ce-9acd-d2f9032d44b4.m3u8"
  },
  {
    "id": 164,
    "name": "CCTV SIMPANG DEWI SARTIKA 2 -F",
    "lat": -6.5928,
    "lng": 106.7908,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/fe33ae11-6bfb-4da5-9c5e-f2c20514116a.m3u8"
  },
  {
    "id": 165,
    "name": "CCTV SIMPANG DEWISARTIKA 1 -P",
    "lat": -6.5925,
    "lng": 106.7905,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/a8738937-9c75-4664-867a-22f9478243c7.m3u8"
  },
  {
    "id": 166,
    "name": "CCTV SIMPANG JL. DREDED -P",
    "lat": -6.611,
    "lng": 106.798,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/1616c078-596f-434f-96bc-d6ba04c3b85c.m3u8"
  },
  {
    "id": 167,
    "name": "CCTV SIMPANG PAHLAWAN 2 -F",
    "lat": -6.606,
    "lng": 106.795,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/fd56d0ac-e4c7-4915-87d3-0d8e59edef1b.m3u8"
  },
  {
    "id": 168,
    "name": "CCTV SIMPANG PAHLAWAN 1 -F",
    "lat": -6.6062,
    "lng": 106.7952,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/427eb879-7e41-469f-b1f0-dd2954d154d9.m3u8"
  },
  {
    "id": 169,
    "name": "CCTV JL.BARU-CIBADAK -P",
    "lat": -6.559,
    "lng": 106.79,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/a0db3c9b-7dcc-4296-b5a2-e4a740fd3b5f.m3u8"
  },
  {
    "id": 170,
    "name": "CCTV JL.BARU - CIBADAK 2 -F",
    "lat": -6.5592,
    "lng": 106.7903,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/676bd3d3-fbd3-48b4-b40c-15bb4105876f.m3u8"
  },
  {
    "id": 171,
    "name": "CCTV JL.BARU - CIBADAK 3 -F",
    "lat": -6.5594,
    "lng": 106.7906,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/0ce422a1-9367-40f7-8af4-71b19f32ea5a.m3u8"
  },
  {
    "id": 172,
    "name": "CCTV JL. BARU DEPAN YOGYA 2",
    "lat": -6.5565,
    "lng": 106.786,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/c9fdf5ba-ae6c-477c-bec2-f1599f534950.m3u8"
  },
  {
    "id": 173,
    "name": "CCTV JL. RAYA TAJUR 1",
    "lat": -6.625,
    "lng": 106.828,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/53f19db7-f6e7-4c32-aea5-9f73507e2106.m3u8"
  },
  {
    "id": 174,
    "name": "CCTV JL. RAYA TAJUR 2",
    "lat": -6.6253,
    "lng": 106.8283,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/5ed5116a-52c7-45b9-bf9b-e2ff355c225e.m3u8"
  },
  {
    "id": 175,
    "name": "CCTV DEPAN PINTU TOL KAYUMANIS 2 - 1",
    "lat": -6.541,
    "lng": 106.766,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/ebe22be2-e5c2-4516-8f7f-9b2a5e19abec.m3u8"
  },
  {
    "id": 176,
    "name": "CCTV JL. BARU DEPAN YOGYA 1",
    "lat": -6.5567,
    "lng": 106.7863,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/f35a34ac-7528-4582-96bb-1f5f0a226f07.m3u8"
  },
  {
    "id": 177,
    "name": "CCTV DEPAN PINTU TOL KAYUMANIS 2 - 2",
    "lat": -6.5412,
    "lng": 106.7663,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/9a2a170b-06b5-4401-ac60-3d0d7fdc44bf.m3u8"
  },
  {
    "id": 179,
    "name": "CCTV PARUNG BANTENG",
    "lat": -6.611,
    "lng": 106.833,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/069413b0-dc6c-4c76-b3c1-2a41b427c61c.m3u8"
  },
  {
    "id": 180,
    "name": "CCTV PARUNG BANTENG 2",
    "lat": -6.6113,
    "lng": 106.8333,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/438bb41f-5bc2-40f6-8bb1-fa99cb3fa721.m3u8"
  },
  {
    "id": 181,
    "name": "CCTV SIMPANG KATULAMPA 1",
    "lat": -6.615,
    "lng": 106.8345,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/7c1016d7-cba8-4ed0-995d-6bbd44920698.m3u8"
  },
  {
    "id": 182,
    "name": "CCTV SIMPANG KATULAMPA 2",
    "lat": -6.6153,
    "lng": 106.8348,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/f22e94b8-f52c-4d15-9b09-1b2ab05e980a.m3u8"
  },
  {
    "id": 183,
    "name": "CCTV KOL AHMAD SYAM 3-1",
    "lat": -6.5805,
    "lng": 106.8125,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/0fc635f9-5c54-427a-86f3-0843626ee719.m3u8"
  },
  {
    "id": 184,
    "name": "CCTV KOL AHMAD SYAM 3-2",
    "lat": -6.5807,
    "lng": 106.8128,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/58f8870f-b68b-4f4b-9a8b-d9b7169c9317.m3u8"
  },
  {
    "id": 185,
    "name": "CCTV KOL AHMAD SYAM 1-2",
    "lat": -6.5815,
    "lng": 106.8135,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/83608f94-69a9-4341-a821-beb90fdee6e3.m3u8"
  },
  {
    "id": 186,
    "name": "CCTV KOL AHMAD SYAM 1-1",
    "lat": -6.5818,
    "lng": 106.8138,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/f03456d3-1d6c-4156-b301-e66e85e1b52e.m3u8"
  },
  {
    "id": 187,
    "name": "CCTV KOL AHMAD SYAM 2",
    "lat": -6.581,
    "lng": 106.813,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/244ee10c-bbb3-4f48-852a-b7bd6fbf5aa1.m3u8"
  },
  {
    "id": 188,
    "name": "CCTV DEPAN BALE BINARUM 1",
    "lat": -6.6095,
    "lng": 106.8115,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/21022dbb-0461-42b4-8677-c1f941d40827.m3u8"
  },
  {
    "id": 189,
    "name": "CCTV DEPAN BALEBINARUM 2",
    "lat": -6.6098,
    "lng": 106.8118,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/3f83b5c2-ad43-4ecd-a935-feab4ebe5654.m3u8"
  },
  {
    "id": 190,
    "name": "CCTV JL. BARU SEBELUM UNDERPASS 1",
    "lat": -6.5535,
    "lng": 106.7815,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/d220d1d8-ff5f-40ee-a3f8-019deb6bd019.m3u8"
  },
  {
    "id": 191,
    "name": "CCTV JL. BARU SEBELUM UNDERPASS 2",
    "lat": -6.5537,
    "lng": 106.7818,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/9c47a00d-90ce-44de-835e-1a4d704f7901.m3u8"
  },
  {
    "id": 192,
    "name": "CCTV SIMPANG MANUNGGAL",
    "lat": -6.584,
    "lng": 106.79,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/fafe128b-2570-4c74-9ca1-da1286fdf59d.m3u8"
  },
  {
    "id": 193,
    "name": "CCTV SIMPANG YASMIN 1",
    "lat": -6.556,
    "lng": 106.7725,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/c18014c9-7e81-4fc4-a799-b71fe2718e08.m3u8"
  },
  {
    "id": 194,
    "name": "CCTV SIMPANG YASMIN 2",
    "lat": -6.5562,
    "lng": 106.7728,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/fa74138a-dd7e-4f10-8174-69475584073d.m3u8"
  },
  {
    "id": 195,
    "name": "CCTV JL. BARU DEPAN UNDERPASS 2",
    "lat": -6.554,
    "lng": 106.782,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/ad7725b1-5f9a-4ccb-97e2-9f5a68990865.m3u8"
  },
  {
    "id": 196,
    "name": "CCTV JL.BARU DEPAN UNDERPASS 1",
    "lat": -6.5542,
    "lng": 106.7822,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/807907af-8920-439d-9ae6-b67daa216818.m3u8"
  },
  {
    "id": 197,
    "name": "CCTV PUTERAN ARAH BONDES 1",
    "lat": -6.5792,
    "lng": 106.7662,
    "videoSrc": "https://restreamer5.kotabogor.go.id/memfs/97adb406-257a-472d-af1f-cd2978c89bdb.m3u8"
  },
  {
    "id": 198,
    "name": "CCTV SIMPANG RSUD KOTA BOGOR",
    "lat": -6.5835,
    "lng": 106.7765,
    "videoSrc": "https://restreamer4.kotabogor.go.id/memfs/5ef1d418-65ba-41da-83db-edee5beec4ff.m3u8"
  },
  {
    "id": 199,
    "name": "CCTV TUGU ARAH OTISTA",
    "lat": -6.6018,
    "lng": 106.8035,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/c1f83df4-edda-4a5b-aff6-a3543236c1a6.m3u8"
  },
  {
    "id": 201,
    "name": "CCTV Simpang A.Yani Dadali 1 -p",
    "lat": -6.5752,
    "lng": 106.7972,
    "videoSrc": "https://restreamer6.kotabogor.go.id/memfs/c7615c34-0764-4770-995a-7ef81ebb1e21.m3u8"
  }
];

const CCTV_DETAIL_BASE = "https://bsw.kotabogor.go.id/cctv/";
