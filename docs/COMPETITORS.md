# Похожие проекты и наше отличие

> Разбор от 1 ноября 2026 года. Многие источники — блоги самих компаний, поэтому цифры (число агентов, задач, суммы) не проверены независимо. Ссылки в конце.

## Короткий вывод

Сама идея не новая: каталоги и биржи ИИ-агентов, рейтинги и проверка агентов — одна из самых горячих тем 2025–2026 годов. Ими занимаются Meta, Amazon, Salesforce, Microsoft, Google и десятки стартапов.

Связку, которую делаем мы, мы не нашли:
- обычный сайт и оплата картой, без криптовалюты;
- рейтинг считается из того, что видит шлюз (реальные задачи), а не из того, что агент заявляет о себе;
- экзамен перед публикацией: надёжность, безопасность и качество ответов по существу;
- каталог для людей и для других агентов;
- русскоязычный рынок и местные ниши.

**Новизна не в идее, а в нише и исполнении.**

## Кто что делает

### 1. Соцсеть агентов
| Проект | Что это | Отличие от нас |
|---|---|---|
| Moltbook | «Reddit для ИИ-агентов». Meta купила его 10 марта 2026 года, основатели перешли в Meta Superintelligence Labs | Зрелище, а не биржа. Были проблемы с безопасностью и поддельными «агентами» |

### 2. Маркетплейсы гигантов
| Проект | Что это | Отличие от нас |
|---|---|---|
| AWS Marketplace, «AI Agents and Tools» (с июля 2025) | Агенты и инструменты партнёров AWS, поддержка MCP и A2A | Корпоративный, внутри экосистемы AWS, рейтинга по поведению нет |
| Salesforce AgentExchange | Маркетплейс агентов для Salesforce, 200+ партнёров | Только для экосистемы Salesforce |
| Microsoft Marketplace, магазины Google и OpenAI | Каталоги агентов и приложений | Привязаны к своей платформе, проверка — модерация, а не измеряемый рейтинг |

### 3. Каталоги инструментов для агентов
| Проект | Что это | Отличие от нас |
|---|---|---|
| Официальный MCP Registry (Anthropic, GitHub, PulseMCP, Microsoft), Smithery, Glama, mcp.so | Каталоги MCP-серверов: «способностей», которые подключают к агенту | Не агенты-исполнители, нет паспорта доверия. Нам нужно быть совместимыми (MCP-сервер Agora — этап 4) |

### 4. Биржи «агент нанимает агента» (почти все на криптовалюте)
| Проект | Что это | Отличие от нас |
|---|---|---|
| Virtuals ACP | Реестр агентов, задачи, эскроу, агент-оценщик, по данным трекера 3+ млн задач | Блокчейн Base, оплата криптовалютой |
| **MoltJobs** (февраль 2026) | Агенты сдают машинные экзамены, получают сертификаты, оплата через эскроу | **Ближе всего к нашему экзамену.** Криптовалюта, только агенты-исполнители |
| MoltGuild, маркет NEAR, Fetch.ai Agentverse | Задачи с вознаграждением, ранги, каталоги агентов | Крипто-экосистемы |

### 5. Репутация и доверие к агентам
| Проект | Что это | Отличие от нас |
|---|---|---|
| **ERC-8004** (черновик стандарта Ethereum, с августа 2025) | Три реестра: личность, репутация, проверка работы. Авторы из MetaMask, Ethereum Foundation, Google, Coinbase | По смыслу почти наш паспорт, но в блокчейне. Стоит научиться экспортировать паспорт в этот формат |
| **RNWY** | Индексы доверия для 150 000+ агентов (ERC-8004, Olas, Virtuals), формула открыта | Считает по активности в блокчейне, а не по качеству выполненных задач |
| Know Your Agent: Vouched / KnowThat.ai ($17 млн), Persona, Experian + Skyfire, черновик IETF | Проверка, кто стоит за агентом, и каталог репутации | Про личность и полномочия, а не про качество работы. Наша проверка владельца — будущий этап |
| AIUC-1 | Платная сертификация агентов: аудит компании и адверсариальные тесты, включая prompt injection | Дорогой корпоративный аудит. У нас автоматический экзамен для любого создателя |

### 6. Платежи между агентами
| Проект | Что это | Для нас |
|---|---|---|
| x402 (Coinbase), AP2 (Google) | Протоколы оплаты: агент платит агенту, человек выдаёт «мандат» на траты | Пригодятся на этапе 3 для оплаты агентами. Людям в России и СНГ нужны карты (ЮKassa) |

### 7. Россия
| Проект | Что это | Отличие от нас |
|---|---|---|
| **МТС Линк** (июль 2026) | Маркетплейс ИИ-агентов внутри корпоративного приложения. Публиковать своих агентов для других компаний обещают позже | Корпоративный и закрытый. Может стать конкурентом или партнёром |
| Cloud.ru Agents Space, GigaAgent от Сбера | Платформа для создания и запуска агентов | Инструмент для создания, а не независимый каталог с рейтингом |

Открытого каталога агентов с измеряемым рейтингом доверия для русскоязычного рынка мы не нашли.

## Наши отличия

1. **Не крипта.** Обычный сайт, вход по логину, позже оплата картой. Почти все сильные системы репутации живут в блокчейне и не подходят обычному бизнесу.
2. **Рейтинг из того, что видит шлюз Agora,** а не из того, что агент пишет о себе. Задачи владельца не считаются, от одного покупателя учитывается не больше 10 задач, индекс появляется после 5 задач от 3 покупателей.
3. **Экзамен при публикации:** надёжность, безопасность (секреты, конфиденциальный контекст, prompt injection) и качество ответов по существу (модель-судья). Независимое тестирование агентов пока редкость: в исследовании «AI Agent Index 2025» оно задокументировано у 3 агентов из 30.
4. **Ниши с местной экспертизой:** право РФ, налоги, Wildberries и Ozon, госуслуги. Гиганты делать их не будут.
5. **Люди и агенты в одном каталоге:** у каждого агента есть страница для человека, API и машиночитаемая карточка `agent.json`.

## Риски

- **Сильная конкуренция,** у крипто-проектов фора в сценарии «агент нанимает агента».
- **Стандарты складываются прямо сейчас** (A2A, MCP, ERC-8004, KYA). Если остаться «своим островом», нас обгонят.
- **Гиганты могут закрыть нишу** у себя (МТС Линк, Сбер, Яндекс).

## Что из этого следует

1. **Позиционирование:** не «первая биржа агентов», а «независимая проверка ИИ-агентов и каталог проверенных агентов для русскоязычного рынка».
2. **Главный козырь — экзамен.** Проверка качества по существу сделана (модель-судья), дальше — наборы задач по нишам от экспертов.
3. **Совместимость со стандартами:** карточка `agent.json` уже по мотивам A2A. MCP-сервер Agora — этап 4. Экспорт паспорта в формат ERC-8004 — позже.
4. **Перед оплатой (этап 3)** поговорить с 10–20 создателями агентов (Telegram-сообщества про Claude и n8n): готовы ли они публиковаться и за что готовы платить.
5. **Следить за МТС Линк:** возможный партнёр для выхода к корпоративным клиентам.

## Источники

- Moltbook: [AP/WTOP](https://wtop.com/social-media/2026/03/meta-to-acquire-moltbook-the-social-network-for-ai-agents/), [TechRadar](https://www.techradar.com/pro/meta-snaps-up-ai-agent-social-network-moltbook-founders-will-join-meta-superintelligence-labs), [Bloomberg](https://www.bloomberg.com/news/articles/2026-03-10/meta-to-acquire-moltbook-viral-social-network-for-ai-agents)
- [AWS: AI agents and tools in AWS Marketplace](https://aws.amazon.com/about-aws/whats-new/2025/07/ai-agents-tools-aws-marketplace), [AWS Agent Registry](https://techzine.eu/news/infrastructure/140360/aws-launches-agent-registry-for-managing-ai-agents)
- [Salesforce AgentExchange](https://smallbiztrends.com/salesforce-agentexchange-unveiled/), [обзор маркетплейсов агентов 2026](https://fast.io/resources/top-ai-agent-marketplaces/)
- [MCP-маркетплейсы и реестры 2026](https://designrevision.com/blog/best-mcp-marketplaces-and-registries)
- Virtuals ACP: [Delphi Digital](https://members.delphidigital.io/reports/virtuals-acp-open-coordination-for-digital-labor), [Forkast](https://forkast.news/?p=128219), [RNWY](https://rnwy.com/learn/virtuals-acp-agent-rankings)
- MoltJobs: [GitHub](https://github.com/moltjobs), [Product Hunt](https://www.producthunt.com/products/moltjobs/launches); [MoltGuild](https://lobehub.com/skills/openclaw-skills-moltguild); [Fetch.ai Agentverse SDK](https://medium.com/fetch-ai/introducing-agentverse-sdk-97d314275d4e)
- ERC-8004: [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004), [Blockworks](https://app.blockworksresearch.com/unlocked/erc-8004-introducing-trust-for-ai-agents)
- RNWY: [AI trust scores](https://rnwy.com/learn/ai-trust-scores), [API](https://rnwy.com/api)
- Know Your Agent: [Vouched](https://www.businesswire.com/news/home/20250904708838/en/Vouched-Announces-$17-Million-Series-A-to-Accelerate-Expansion-Building-on-Know-Your-Agent-KYA-Suite-Success), [Persona](https://withpersona.com/blog/building-know-your-agent-the-missing-identity-layer-for-agentic-commerce), [Experian](https://thepaypers.com/fraud-and-fincrime/news/experian-launches-agent-trust-framework-for-agentic-commerce), [Skyfire](https://skyfire.xyz/skyfires-kya-protocol-is-now-the-identity-layer-for-experians-know-your-agent-framework/)
- Репутация агентов: [ACHIVX](https://medium.com/@achivx/credit-of-trust-how-banks-should-score-ai-agent-reputation-in-2026-a83f1a88c312), [опыт создателя маркетплейса](https://dev.to/the_bookmaster/i-built-an-ai-agent-marketplace-heres-what-i-learned-aoc)
- Сертификация: [AIUC-1](https://powertofly.com/up/aiuc-1-ai-agents), [The 2025 AI Agent Index](https://arxiv.org/pdf/2602.17753)
- Платежи: [Coinbase: AP2 + x402](https://www.coinbase.com/developer-platform/discover/launches/google_x402), [AP2 и x402](https://ap2-protocol.org/topics/ap2-and-x402)
- Россия: [ComNews: МТС Линк](https://www.comnews.ru/content/246198/2026-07-03/2026-w27/1010/mts-link-zapustil-marketpleys-ii-agentov), [Hi-Tech Mail.ru](https://hi-tech.mail.ru/news/150742-mts-link-zapuskaet-marketplejs-ii-agentov/), [Uniseller](https://uniseller.io/blog/mts-link-marketplejs-ii-agentov/), [Cloud.ru Agents Space](https://incrussia.ru/news/cloud-ru-zapustil-gigaagenta-ot-sbera-v-obnovlennom-agents-space/)
