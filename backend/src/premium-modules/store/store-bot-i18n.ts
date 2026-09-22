export type BotLocale = 'fa' | 'en';

export type BotMessageKey =
  | 'btn.buy'
  | 'btn.renew'
  | 'btn.wallet'
  | 'btn.test'
  | 'btn.myServices'
  | 'btn.myToken'
  | 'btn.invite'
  | 'btn.support'
  | 'btn.agency'
  | 'btn.payg'
  | 'btn.back'
  | 'btn.topUp'
  | 'btn.payWallet'
  | 'btn.payCard'
  | 'btn.payStars'
  | 'btn.payWalletPay'
  | 'btn.miniApp'
  | 'btn.hide'
  | 'btn.cancel'
  | 'btn.serviceDetails'
  | 'btn.openSub'
  | 'btn.qrCode'
  | 'btn.claimService'
  | 'btn.goWallet'
  | 'btn.trackOrder'
  | 'btn.renewNow'
  | 'btn.couponHave'
  | 'btn.couponContinue'
  | 'btn.couponSkip'
  | 'btn.couponUse'
  | 'btn.couponSkipKeep'
  | 'home.choose'
  | 'home.welcome'
  | 'license.expiredAdmin'
  | 'license.botInactive'
  | 'token.title'
  | 'token.body'
  | 'support.title'
  | 'invite.title'
  | 'invite.body'
  | 'wallet.title'
  | 'wallet.balance'
  | 'wallet.ledgerTitle'
  | 'wallet.ledgerEmpty'
  | 'wallet.ledgerLine'
  | 'wallet.ledger.payg'
  | 'wallet.ledger.paygAgg'
  | 'wallet.ledger.purchase'
  | 'wallet.ledger.purchaseVpn'
  | 'wallet.ledger.purchaseDigital'
  | 'wallet.ledger.deposit'
  | 'wallet.ledger.adjust'
  | 'wallet.ledger.other'
  | 'wallet.paygToday'
  | 'wallet.askAmount'
  | 'wallet.amountConfirm'
  | 'wallet.sendReceipt'
  | 'wallet.submitted'
  | 'wallet.invalidAmount'
  | 'wallet.insufficient'
  | 'wallet.approved'
  | 'wallet.rejected'
  | 'wallet.currency.toman'
  | 'wallet.currency.usd'
  | 'buy.hub'
  | 'buy.btn.vpn'
  | 'buy.btn.payg'
  | 'buy.btn.digital'
  | 'buy.pickCategory'
  | 'buy.pickPlan'
  | 'buy.categoryPlans'
  | 'buy.noProducts'
  | 'buy.noCategoryProducts'
  | 'buy.productNotFound'
  | 'buy.freeTestLabel'
  | 'buy.pickIp'
  | 'buy.pickAddons'
  | 'btn.addonsContinue'
  | 'buy.priceSummary'
  | 'buy.paymentMethod'
  | 'buy.sendReceipt'
  | 'buy.paidWallet'
  | 'buy.starsInvoice'
  | 'buy.walletPayInvoice'
  | 'buy.orderSubmitted'
  | 'renew.orderSubmitted'
  | 'coupon.ask'
  | 'coupon.askCode'
  | 'coupon.offer'
  | 'coupon.offerHint'
  | 'coupon.offerLine'
  | 'coupon.applied'
  | 'coupon.invalid'
  | 'test.pickPlan'
  | 'test.none'
  | 'test.waitDelivering'
  | 'test.created'
  | 'renew.pickService'
  | 'renew.none'  | 'renew.pickPlan'
  | 'renew.pickCategory'
  | 'renew.noCategoryPlans'
  | 'renew.paymentMethod'
  | 'renew.sendReceipt'
  | 'renew.paidWallet'
  | 'renew.starsInvoice'
  | 'renew.walletPayInvoice'
  | 'claim.askLink'
  | 'claim.invalidLink'
  | 'claim.pickCategory'
  | 'claim.noCategories'
  | 'claim.ok'
  | 'services.title'
  | 'services.none'
  | 'services.detail'
  | 'services.category'
  | 'services.hidden'
  | 'services.expiry'
  | 'services.traffic'
  | 'services.subLink'
  | 'services.unlimited'
  | 'services.noExpiry'
  | 'services.status.active'
  | 'services.status.expired'
  | 'services.status.disabled'
  | 'common.paying'
  | 'common.sendReceipt'
  | 'common.sessionExpired'
  | 'common.error'
  | 'common.receiptNeeded'
  | 'gate.channelRequired'
  | 'gate.joinChannel'
  | 'gate.iJoined'
  | 'gate.stillNotMember'
  | 'gate.customerBlocked'
  | 'digital.ready'
  | 'digital.code'
  | 'digital.product'
  | 'digital.preconfirm.manual'
  | 'digital.preconfirm.automatic'
  | 'digital.preconfirm.hybridAuto'
  | 'digital.preconfirm.hybridManual'
  | 'digital.preconfirm.operator'
  | 'digital.catalog.auto'
  | 'digital.catalog.operator'
  | 'digital.outOfStock'
  | 'digital.pending'
  | 'digital.orders.waiting'
  | 'digital.orders.title'
  | 'digital.orders.none'
  | 'digital.orders.detail'
  | 'digital.orders.pendingStatus'
  | 'digital.orders.deliveredStatus'
  | 'digital.orders.showCode'
  | 'btn.digitalServices'
  | 'payg.disabled'
  | 'payg.home'
  | 'payg.pickCategory'
  | 'payg.noCategories'
  | 'payg.pickPlan'
  | 'payg.pickDevices'
  | 'payg.devicesLine'
  | 'payg.confirm'
  | 'payg.confirmHint'
  | 'payg.btn.confirm'
  | 'payg.mode.volume'
  | 'payg.mode.time'
  | 'payg.noPlans'
  | 'services.hub'
  | 'services.hub.vpn'
  | 'services.hub.payg'
  | 'services.hub.digital'
  | 'payg.activated'
  | 'payg.activateFailed'
  | 'payg.needTopup'
  | 'payg.chargeReminder'
  | 'payg.mine'
  | 'payg.none'
  | 'payg.usage'
  | 'payg.noUsage'
  | 'payg.btn.categories'
  | 'payg.btn.mine'
  | 'payg.btn.usage'
  | 'payg.unit.hour'
  | 'payg.unit.gb'
  | 'payg.unit.day'
  | 'payg.btn.pause'
  | 'payg.btn.resume'
  | 'payg.paused'
  | 'payg.resumed'
  | 'payg.pauseHint'
  | 'payg.activationFee'
  | 'payg.maxSubsReached';

const FA: Record<BotMessageKey, string> = {
  'btn.buy': '🛒 خرید سرویس',
  'btn.renew': '🔄 تمدید سرویس',
  'btn.wallet': '💰 کیف پول',
  'btn.test': '🧪 اکانت تست',
  'btn.myServices': '📦 سرویس‌های من',
  'btn.myToken': '🔑 توکن من',
  'btn.invite': '🎁 دعوت دوستان',
  'btn.support': '💬 پشتیبانی',
  'btn.agency': '🏢 نمایندگی',
  'btn.payg': '⚡ پرداخت به‌ازای مصرف',
  'btn.back': '⬅️ بازگشت',
  'btn.topUp': '➕ شارژ کیف پول',
  'btn.payWallet': '💰 پرداخت از کیف پول',
  'btn.payCard': '💳 کارت‌به‌کارت + رسید',
  'btn.payStars': '⭐ پرداخت با Telegram Stars',
  'btn.payWalletPay': '👛 Wallet Pay',
  'btn.miniApp': '🚀 باز کردن مینی‌اپ',
  'btn.hide': '🙈 مخفی از لیست',
  'btn.cancel': '❌ انصراف',
  'btn.serviceDetails': '📋 جزئیات سرویس',
  'btn.openSub': '🔗 باز کردن لینک ساب',
  'btn.qrCode': '▦ QR Code',
  'btn.claimService': '➕ ثبت سرویس قبلی',
  'btn.goWallet': '💰 رفتن به کیف پول',
  'btn.trackOrder': '🔎 پیگیری سفارش',
  'btn.renewNow': '🔄 تمدید سرویس',
  'btn.couponHave': '🎟 کد تخفیف دارم',
  'btn.couponContinue': '➡️ ادامه',
  'btn.couponSkip': '⏭ بدون کد تخفیف',
  'btn.couponUse': '{code} · تخفیف {discount} · پرداخت {final}',
  'btn.couponSkipKeep': 'رد کردن — کد می‌ماند',
  'home.choose': '🏪 <b>{title}</b>\nیک گزینه را انتخاب کنید:',
  'home.welcome':
    '🎉 به فروشگاه <b>{title}</b> خوش آمدید!\n\n✨ اینجا می‌تونید:\n🛒 سرویس جدید بخرید\n📦 سرویس‌هاتون رو مدیریت کنید\n🔄 تمدید کنید و لینک ساب بگیرید\n\nاز دکمه‌های زیر شروع کنید 👇',
  'license.expiredAdmin':
    '⛔ لایسنس پرمیوم به پایان رسیده است.\nبرای فعال‌سازی مجدد ربات، لایسنس را تمدید کنید و از پنل «بررسی مجدد لایسنس» را بزنید.',
  'license.botInactive':
    '⏸ ربات موقتاً غیرفعال است.\nلطفاً کمی بعد دوباره تلاش کنید.',
  'token.title': '🔑 <b>توکن ورود وب</b>',
  'token.body':
    '🔑 <b>توکن ورود وب</b>\n<code>{token}</code>\n\nفقط در مرورگر استفاده کنید. مینی‌اپ به توکن نیاز ندارد.',
  'support.title': '💬 پشتیبانی',
  'invite.title': '🎁 <b>دعوت دوستان</b>',
  'invite.body':
    '🎁 <b>دعوت دوستان</b>\n\nبا اشتراک‌گذاری لینک زیر، دوستانتان را دعوت کنید.\nبا هر عضویت و خرید، به تخفیف‌ها و پاداش‌های ویژه نزدیک‌تر می‌شوید — هرچه معرفی بیشتر، خدمات بیشتر!\n\n📎 لینک اختصاصی شما:\n<code>{link}</code>\n\n👥 معرفی‌ها: <b>{count}</b>\n🛒 خرید از معرفی: <b>{orders}</b>\n💵 مجموع فروش: <b>{revenue}</b>',
  'wallet.title': '💰 <b>کیف پول</b>',
  'wallet.balance': '💰 <b>کیف پول</b>\nموجودی: <b>{balance}</b>',
  'wallet.ledgerTitle': '📜 <b>آخرین تراکنش‌ها</b>',
  'wallet.ledgerEmpty': 'تراکنشی ثبت نشده است.',
  'wallet.ledgerLine': '{date} · {label} · <b>{amount}</b>',
  'wallet.ledger.payg': 'PAYG',
  'wallet.ledger.paygAgg': 'مصرف PAYG (تجمیعی)',
  'wallet.ledger.purchase': 'خرید',
  'wallet.ledger.purchaseVpn': 'خرید VPN',
  'wallet.ledger.purchaseDigital': 'خرید دیجیتال',
  'wallet.ledger.deposit': 'شارژ',
  'wallet.ledger.adjust': 'تنظیم ادمین',
  'wallet.ledger.other': 'سایر',
  'wallet.paygToday': '⚡ مصرف PAYG امروز: <b>{amount}</b>',
  'wallet.askAmount':
    '➕ مبلغ شارژ را به <b>{currency}</b> بفرستید.\nمثال: <code>200000</code>',
  'wallet.amountConfirm':
    '💳 <b>شارژ {amount}</b>\n\n💳 اطلاعات پرداخت:\n{paymentInfo}\n\n✅ بعد از واریز، <b>فیش واریز</b> یا <b>متن تراکنش</b> را همین‌جا برای ربات بفرستید.',
  'wallet.sendReceipt':
    '📎 فیش واریز (عکس) یا متن تراکنش را بفرستید.',
  'wallet.submitted':
    '⏳ <b>درخواست افزایش موجودی ثبت شد</b>\nبه‌زودی توسط ادمین بررسی و تأیید می‌شود.\nپس از تأیید، موجودی کیف پولتان به‌روز می‌شود.',
  'wallet.invalidAmount': 'مبلغ نامعتبر است. یک عدد مثبت بفرستید (مثال: 200000).',
  'wallet.insufficient':
    '⚠️ موجودی کیف پول کافی نیست.\nموجودی فعلی: <b>{balance}</b>\nمبلغ لازم: <b>{needed}</b>',
  'wallet.approved':
    '✅ شارژ کیف پول تأیید شد.\nمبلغ: <b>{amount}</b>\nموجودی جدید: <b>{balance}</b>',
  'wallet.rejected': '❌ درخواست شارژ رد شد.{reason}',
  'wallet.currency.toman': 'تومان',
  'wallet.currency.usd': 'USD',
  'buy.hub': '🛒 <b>خرید</b>\nچه می‌خواهید بخرید؟',
  'buy.btn.vpn': '🛡 خرید VPN',
  'buy.btn.payg': '⚡ پرداخت به‌ازای مصرف',
  'buy.btn.digital': '🎁 کالای دیجیتال',
  'buy.pickCategory': '🛒 خرید سرویس — یک دسته‌بندی انتخاب کنید',
  'buy.pickPlan': 'یک پلن انتخاب کنید:',
  'buy.categoryPlans': '{title}\n\n{description}\n\nیک پلن انتخاب کنید:',
  'buy.noProducts': 'پلنی موجود نیست.',
  'buy.noCategoryProducts': 'در این دسته‌بندی محصولی نیست.',
  'buy.productNotFound': 'محصول پیدا نشد.',
  'buy.freeTestLabel': '🧪 تست رایگان',
  'buy.pickIp': '👥 محدودیت کاربر / IP را انتخاب کنید:',
  'buy.pickAddons':
    '{intro}\n\n📦 قیمت محصول: <b>{base}</b>\nافزونه‌های اختیاری را با زدن دکمه تیک بزنید (دوباره بزنید تا برداشته شود).\nکاربر/روز نهایی = پایه محصول + افزونه‌های انتخابی.',
  'btn.addonsContinue': '➡️ ادامه',
  'buy.priceSummary':
    '💰 قیمت محصول: <b>{base}</b>\n➕ افزونه‌ها: <b>{addons}</b>\n💳 قابل پرداخت: <b>{final}</b>',
  'buy.paymentMethod': 'روش پرداخت:',
  'buy.sendReceipt':
    '💳 <b>اطلاعات پرداخت</b>\n{paymentInfo}\n\n{summary}\n\n📎 بعد از واریز، <b>عکس رسید یا متن پیگیری کافی است</b> (نیازی به هر دو نیست).',
  'buy.paidWallet':
    '✅ با کیف پول پرداخت شد\nسفارش <code>{code}</code>\nوضعیت: {status}',
  'buy.starsInvoice':
    '⭐ فاکتور Telegram Stars ارسال شد.\nسفارش <code>{code}</code>\nپس از پرداخت در تلگرام، سرویس خودکار فعال می‌شود.',
  'buy.walletPayInvoice':
    '👛 سفارش Wallet Pay ساخته شد.\nکد پیگیری: <code>{code}</code>\nبا دکمه 👛 Wallet Pay داخل ولت تلگرام پرداخت کنید. سرویس بعد از تأیید وب‌هوک فعال می‌شود.',
  'buy.orderSubmitted':
    '✅ <b>سفارش ثبت شد</b>\nکد پیگیری: <code>{code}</code>\n\nبه‌زودی تحویل داده خواهد شد. از دکمه پیگیری می‌توانید وضعیت را ببینید.',
  'renew.orderSubmitted':
    '✅ <b>درخواست تمدید ثبت شد</b>\nکد پیگیری: <code>{code}</code>\n\nبه‌زودی بررسی و اعمال می‌شود.',
  'coupon.ask': '🎟 کد تخفیف دارید؟',
  'coupon.askCode': 'کد تخفیف را همین‌جا بفرستید:',
  'coupon.offer': '🎟 کد تخفیف مخصوص شما برای این سرویس:',
  'coupon.offerHint':
    'روی هر کد بزنید. مبلغ تخفیف و مبلغ قابل‌پرداخت جدا نوشته شده است. بدون کد هم می‌توانید ادامه دهید.',
  'coupon.offerLine':
    '• <code>{code}</code>{desc}\n  تخفیف: <b>{discount}</b>\n  قابل پرداخت: <b>{final}</b>',
  'coupon.applied':
    '✅ کد <code>{code}</code> اعمال شد.\nمبلغ: <b>{amount}</b>\nتخفیف: <b>{discount}</b>\nقابل پرداخت: <b>{final}</b>',
  'coupon.invalid': '❌ کد نامعتبر است.\n{reason}\nدوباره بفرستید یا بدون کد ادامه دهید.',
  'test.pickPlan': '🧪 اکانت تست — یکی را انتخاب کنید:',
  'test.none': 'پلن تستی موجود نیست.',
  'test.waitDelivering':
    '⏳ چند لحظه صبر کنید تا سرویس تست برایتان ارسال شود…',
  'renew.pickService': '🔄 سرویسی برای تمدید انتخاب کنید:',
  'renew.none': 'سرویس فعالی برای تمدید نیست.',
  'renew.pickPlan': 'پلن تمدید را انتخاب کنید (همان دسته‌بندی سرویس):',
  'renew.pickCategory':
    'این سرویس هنوز دسته‌بندی ندارد.\nدسته‌بندی اصلی خرید را انتخاب کنید تا پلن‌های تمدید همان دسته نمایش داده شود:',
  'renew.noCategoryPlans': 'پلنی برای تمدید در این دسته‌بندی موجود نیست.',
  'renew.paymentMethod': 'روش پرداخت:',
  'renew.sendReceipt':
    '💳 <b>اطلاعات پرداخت</b>\n{paymentInfo}\n\n📎 بعد از واریز، رسید تمدید را (عکس یا متن) بفرستید.',
  'renew.paidWallet': '✅ با کیف پول تمدید شد\nسفارش <code>{code}</code>',
  'renew.starsInvoice':
    '⭐ فاکتور Telegram Stars برای تمدید ارسال شد.\nسفارش <code>{code}</code>',
  'renew.walletPayInvoice':
    '👛 سفارش تمدید Wallet Pay ساخته شد.\nکد پیگیری: <code>{code}</code>\nبا دکمه 👛 Wallet Pay داخل ولت تلگرام پرداخت کنید.',
  'claim.askLink':
    '➕ <b>ثبت سرویس خریداری‌شده</b>\n\nلینک سابسکریپشن را بفرستید.\nهم لینک پنل (<code>/s/…</code>) و هم لینک بومی ثنایی/3x-ui (<code>/sub/…</code>) پذیرفته می‌شود.',
  'claim.invalidLink': 'لینک نامعتبر است. لینک کامل ساب را بفرستید.',
  'claim.pickCategory':
    'دسته‌بندی این سرویس کدام بوده؟\n(برای تمدیدهای بعدی فقط پلن‌های همان دسته نشان داده می‌شود)',
  'claim.noCategories': 'دسته‌بندی فعالی در فروشگاه تعریف نشده.',
  'claim.ok':
    '✅ سرویس <b>{name}</b> به حساب شما اضافه شد.\n\n🔗 لینک ساب سیستم شما:\n<code>{link}</code>',
  'services.title': '📦 <b>سرویس‌های من</b>\nبرای مشاهده جزئیات و لینک ساب، روی سرویس بزنید:',
  'services.none': 'سرویسی در حساب شما نیست.',
  'services.detail':
    '📦 <b>{name}</b>\nوضعیت: <b>{status}</b>\n\n{details}',
  'services.category': '📂 دسته: {category}',
  'services.hidden': '✅ سرویس از لیست شما مخفی شد.',
  'services.expiry': '⏱ انقضا: {expiry}',
  'services.traffic': '📊 ترافیک: {used} / {total}',
  'services.subLink':
    '🔗 <b>لینک اشتراک</b> (برای کپی لمس کنید):\n<code>{url}</code>',
  'services.unlimited': 'نامحدود',
  'services.noExpiry': 'بدون محدودیت زمانی',
  'services.status.active': 'فعال',
  'services.status.expired': 'منقضی',
  'services.status.disabled': 'غیرفعال',
  'common.paying': 'در حال پرداخت…',
  'common.sendReceipt': 'رسید را بفرستید',
  'common.sessionExpired': 'نشست منقضی شد. دوباره از منو شروع کنید.',
  'common.error': 'خطا',
  'common.receiptNeeded': 'عکس یا متن رسید را بفرستید.',
  'test.created': '🧪 اکانت تست ساخته شد\nسرویس: {service}\nنام: {name}\nکاربر: {user}',
  'gate.channelRequired':
    '🔒 برای استفاده از این ربات ابتدا باید عضو کانال شوید.\n۱️⃣ روی «مشاهده کانال» بزنید و عضو شوید\n۲️⃣ برگردید و روی «✅ عضو شدم» بزنید تا ربات فعال شود',
  'gate.joinChannel': '📢 مشاهده کانال',
  'gate.iJoined': '✅ عضو شدم',
  'gate.stillNotMember': 'هنوز عضو کانال نشده‌اید؛ ابتدا عضو شوید و دوباره «عضو شدم» را بزنید.',
  'gate.customerBlocked':
    '🚫 دسترسی شما به این فروشگاه مسدود شده است.\nدر صورت اعتراض با پشتیبانی تماس بگیرید.',
  'digital.ready': '🎁 کد شما آماده است',
  'digital.code': 'کد شما:\n<code>{code}</code>',
  'digital.product': '📦 {name}',
  'digital.preconfirm.manual':
    '⏳ تحویل این محصول توسط اپراتور است و پس از تأیید پرداخت انجام می‌شود.',
  'digital.preconfirm.automatic':
    '⚡️ پس از تأیید سفارش، به‌صورت خودکار ارسال خواهد شد.',
  'digital.preconfirm.hybridAuto':
    '⚡️ پس از تأیید سفارش، به‌صورت خودکار ارسال خواهد شد.',
  'digital.preconfirm.hybridManual':
    '⏳ تحویل توسط اپراتور — پس از تأیید پرداخت، کد برایتان ارسال می‌شود.',
  'digital.preconfirm.operator':
    '⏳ تحویل توسط اپراتور — پس از تأیید سفارش، کد یا لینک برایتان ارسال می‌شود.',
  'digital.catalog.auto': 'ارسال خودکار',
  'digital.catalog.operator': 'تحویل توسط اپراتور',
  'digital.outOfStock': 'ناموجود',
  'digital.pending':
    '⏳ سفارش دیجیتال شما ثبت شد.\nپس از آماده‌سازی، کد از همین ربات برایتان ارسال می‌شود.',
  'digital.orders.waiting': 'سفارش ثبت شد. به‌محض آماده‌شدن اطلاع می‌دهیم.',
  'digital.orders.pendingStatus': 'در انتظار',
  'digital.orders.deliveredStatus': 'تحویل‌شده',
  'digital.orders.showCode': '🔐 نمایش کد',
  'btn.digitalServices': '🎁 سرویس‌های دیجیتال',
  'payg.disabled': '⛔ سرویس پرداخت به‌ازای مصرف در حال حاضر فعال نیست.',
  'payg.home': '⚡ <b>پرداخت به‌ازای مصرف</b>\nیک گزینه را انتخاب کنید:',
  'payg.pickCategory': '⚡ یک دسته‌بندی انتخاب کنید:',
  'payg.noCategories': 'هنوز دسته‌بندی فعالی برای PAYG وجود ندارد.',
  'payg.pickPlan': '📋 یک پلن انتخاب کنید:',
  'payg.pickDevices': '👥 تعداد کاربر / دستگاه را انتخاب کنید:',
  'payg.devicesLine': 'تعداد کاربر: <b>{n}</b>',
  'payg.confirm':
    '⚡ <b>تأیید فعال‌سازی PAYG</b>\n\n📦 پلن: <b>{plan}</b>\n📐 نوع: <b>{mode}</b>\n👥 کاربر: <b>{deviceLabel}</b> ({devices})\n💰 نرخ: <b>{unitPrice}</b> / {unit}\n\n💳 موجودی: <b>{balance}</b>\n🔒 حداقل لازم: <b>{minBalance}</b>',
  'payg.confirmHint':
    'سرویس روی پنل نامحدود ساخته می‌شود؛ سیستم ما بر اساس مصرف از کیف پول کم می‌کند و فقط وقتی موجودی صفر شود قطع می‌کند.',
  'payg.btn.confirm': '✅ تأیید و فعال‌سازی',
  'payg.mode.volume': 'حجمی (به ازای گیگ)',
  'payg.mode.time': 'زمانی / نامحدود (ساعتی)',
  'payg.noPlans': 'در این دسته پلنی فعال نیست.',
  'services.hub': '📦 <b>سرویس‌های من</b>\nکدام بخش را می‌خواهید ببینید؟',
  'services.hub.vpn': '🌐 سرویس اینترنت آزاد',
  'services.hub.payg': '⚡ پرداخت به‌ازای مصرف',
  'services.hub.digital': '🎁 محصولات دیجیتال',
  'digital.orders.title': '🎁 <b>خریدهای دیجیتال شما</b>',
  'digital.orders.none': 'هنوز محصول دیجیتالی نخریده‌اید.',
  'digital.orders.detail':
    '🎁 <b>{product}</b>\n📶 وضعیت: <b>{status}</b>\n🆔 پیگیری: <code>{tracking}</code>\n📅 تاریخ: {date}\n💰 مبلغ: <b>{amount}</b>',
  'payg.activated':
    '✅ سرویس PAYG فعال شد.\n\n📦 پلن: <b>{plan}</b>\n📶 وضعیت: <b>{status}</b>\n🆔 اشتراک: <code>{id}</code>',
  'payg.activateFailed': '⛔ فعال‌سازی ناموفق بود:\n{error}',
  'payg.needTopup':
    '⚠️ موجودی کیف پول برای فعال‌سازی کافی نیست.\n\nموجودی: <b>{balance}</b>\nحداقل لازم: <b>{minBalance}</b>\nمبلغ پیشنهادی شارژ: <b>{shortfall}</b>\n\nابتدا کیف پول را شارژ کنید.',
  'payg.chargeReminder':
    '⚠️ <b>یادآوری مهم:</b> کیف پول را شارژ نگه دارید؛ فقط وقتی موجودی صفر شود سرویس PAYG قطع می‌شود.',
  'payg.mine': '📦 <b>سرویس‌های PAYG شما</b>',
  'payg.none': 'هنوز اشتراک PAYG فعالی ندارید.',
  'payg.usage':
    '📊 <b>مصرف روزانه</b>\n📦 پلن: <b>{plan}</b>\n📶 وضعیت: <b>{status}</b>\n\n{summary}',
  'payg.noUsage': 'هنوز مصرفی ثبت نشده است.',
  'payg.btn.categories': '📂 دسته‌بندی‌ها',
  'payg.btn.mine': '📦 سرویس‌های من',
  'payg.btn.usage': '📊 مصرف',
  'payg.unit.hour': 'ساعت',
  'payg.unit.gb': 'گیگ',
  'payg.unit.day': 'روز',
  'payg.btn.pause': '⏸ قطع سرویس',
  'payg.btn.resume': '▶️ فعال‌سازی مجدد',
  'payg.paused': '⏸ سرویس قطع شد. تا وقتی دوباره فعال نکنید هزینه زمانی کسر نمی‌شود.',
  'payg.resumed': '▶️ سرویس دوباره فعال شد.',
  'payg.pauseHint':
    'می‌توانید سرویس زمانی را موقتاً قطع کنید تا دیگر از کیف پول کم نشود.',
  'payg.activationFee': 'هزینه ساخت: <b>{amount}</b> ({qty} {unit})',
  'payg.maxSubsReached':
    '⛔ به سقف تعداد سرویس PAYG رسیده‌اید ({max}). یکی را ببندید تا جا باز شود.',
};

const EN: Record<BotMessageKey, string> = {
  'btn.buy': '🛒 Buy service',
  'btn.renew': '🔄 Renew service',
  'btn.wallet': '💰 Wallet',
  'btn.test': '🧪 Test account',
  'btn.myServices': '📦 My services',
  'btn.myToken': '🔑 My token',
  'btn.invite': '🎁 Invite friends',
  'btn.support': '💬 Support',
  'btn.agency': '🏢 Agency',
  'btn.payg': '⚡ Pay as you go',
  'btn.back': '⬅️ Back',
  'btn.topUp': '➕ Top up wallet',
  'btn.payWallet': '💰 Pay with wallet',
  'btn.payCard': '💳 Card transfer + receipt',
  'btn.payStars': '⭐ Pay with Telegram Stars',
  'btn.payWalletPay': '👛 Wallet Pay',
  'btn.miniApp': '🚀 Open Mini App',
  'btn.hide': '🙈 Hide from list',
  'btn.cancel': '❌ Cancel',
  'btn.serviceDetails': '📋 Service details',
  'btn.openSub': '🔗 Open sub link',
  'btn.qrCode': '▦ QR Code',
  'btn.claimService': '➕ Register past service',
  'btn.goWallet': '💰 Go to wallet',
  'btn.trackOrder': '🔎 Track order',
  'btn.renewNow': '🔄 Renew service',
  'btn.couponHave': '🎟 I have a discount code',
  'btn.couponContinue': '➡️ Continue',
  'btn.couponSkip': '⏭ Skip discount code',
  'btn.couponUse': '{code} · off {discount} · pay {final}',
  'btn.couponSkipKeep': 'Skip — keep the code',
  'home.choose': '🏪 <b>{title}</b>\nChoose an option:',
  'home.welcome':
    '🎉 Welcome to <b>{title}</b>!\n\n✨ Here you can:\n🛒 Buy a new service\n📦 Manage your services\n🔄 Renew and get your sub link\n\nUse the buttons below 👇',
  'license.expiredAdmin':
    '⛔ Premium license has expired.\nRenew your license, then tap “Re-check license” in the panel to reactivate the bot.',
  'license.botInactive':
    '⏸ The bot is temporarily unavailable.\nPlease try again later.',
  'token.title': '🔑 <b>Web login token</b>',
  'token.body':
    '🔑 <b>Web login token</b>\n<code>{token}</code>\n\nUse only in browser. Mini App does not need it.',
  'support.title': '💬 Support',
  'invite.title': '🎁 <b>Invite friends</b>',
  'invite.body':
    '🎁 <b>Invite friends</b>\n\nShare your link below. When friends join and purchase, you unlock discounts and rewards — more referrals, more benefits!\n\n📎 Your link:\n<code>{link}</code>\n\n👥 Referrals: <b>{count}</b>\n🛒 Orders from referrals: <b>{orders}</b>\n💵 Sales total: <b>{revenue}</b>',
  'wallet.title': '💰 <b>Wallet</b>',
  'wallet.balance': '💰 <b>Wallet</b>\nBalance: <b>{balance}</b>',
  'wallet.ledgerTitle': '📜 <b>Recent activity</b>',
  'wallet.ledgerEmpty': 'No transactions yet.',
  'wallet.ledgerLine': '{date} · {label} · <b>{amount}</b>',
  'wallet.ledger.payg': 'PAYG',
  'wallet.ledger.paygAgg': 'PAYG usage (aggregated)',
  'wallet.ledger.purchase': 'Purchase',
  'wallet.ledger.purchaseVpn': 'VPN purchase',
  'wallet.ledger.purchaseDigital': 'Digital purchase',
  'wallet.ledger.deposit': 'Top-up',
  'wallet.ledger.adjust': 'Admin adjust',
  'wallet.ledger.other': 'Other',
  'wallet.paygToday': '⚡ PAYG spent today: <b>{amount}</b>',
  'wallet.askAmount':
    '➕ Send the top-up amount in <b>{currency}</b>.\nExample: <code>10</code>',
  'wallet.amountConfirm':
    '💳 <b>Top up {amount}</b>\n\n💳 Payment details:\n{paymentInfo}\n\n✅ After paying, send the <b>receipt photo</b> or <b>transaction text</b> here.',
  'wallet.sendReceipt': '📎 Send receipt photo or transaction text.',
  'wallet.submitted':
    '⏳ <b>Top-up request submitted</b>\nAn admin will review it shortly.\nYou will be notified when approved.',
  'wallet.invalidAmount': 'Invalid amount. Send a positive number (e.g. 10).',
  'wallet.insufficient':
    '⚠️ Insufficient wallet balance.\nCurrent: <b>{balance}</b>\nNeeded: <b>{needed}</b>',
  'wallet.approved':
    '✅ Wallet top-up approved.\nAmount: <b>{amount}</b>\nNew balance: <b>{balance}</b>',
  'wallet.rejected': '❌ Top-up rejected.{reason}',
  'wallet.currency.toman': 'Toman',
  'wallet.currency.usd': 'USD',
  'buy.hub': '🛒 <b>Buy</b>\nWhat would you like to purchase?',
  'buy.btn.vpn': '🛡 Buy VPN',
  'buy.btn.payg': '⚡ Pay as you go',
  'buy.btn.digital': '🎁 Digital goods',
  'buy.pickCategory': '🛒 Buy — pick a category',
  'buy.pickPlan': 'Pick a plan:',
  'buy.categoryPlans': '{title}\n\n{description}\n\nPick a plan:',
  'buy.noProducts': 'No plans available.',
  'buy.noCategoryProducts': 'No products in this category.',
  'buy.productNotFound': 'Product not found.',
  'buy.freeTestLabel': '🧪 Free test',
  'buy.pickIp': '👥 Choose IP / user limit:',
  'buy.pickAddons':
    '{intro}\n\n📦 Product price: <b>{base}</b>\nTap add-ons to tick them (tap again to untick).\nFinal users/days = product base + selected add-ons.',
  'btn.addonsContinue': '➡️ Continue',
  'buy.priceSummary':
    '💰 Product: <b>{base}</b>\n➕ Add-ons: <b>{addons}</b>\n💳 Payable: <b>{final}</b>',
  'buy.paymentMethod': 'Payment method:',
  'buy.sendReceipt':
    '💳 <b>Payment details</b>\n{paymentInfo}\n\n{summary}\n\n📎 After paying, send a <b>receipt photo or text</b> — one is enough.',
  'buy.paidWallet':
    '✅ Paid with wallet\nOrder <code>{code}</code>\nStatus: {status}',
  'buy.starsInvoice':
    '⭐ Telegram Stars invoice sent.\nOrder <code>{code}</code>\nAfter you pay in Telegram, the service is activated automatically.',
  'buy.walletPayInvoice':
    '👛 Wallet Pay order created.\nTracking code: <code>{code}</code>\nTap 👛 Wallet Pay to pay inside Telegram Wallet. The service activates after the webhook is verified.',
  'buy.orderSubmitted':
    '✅ <b>Order submitted</b>\nTracking code: <code>{code}</code>\n\nIt will be delivered soon. Use Track to check status.',
  'renew.orderSubmitted':
    '✅ <b>Renewal submitted</b>\nTracking code: <code>{code}</code>\n\nIt will be reviewed and applied soon.',
  'coupon.ask': '🎟 Do you have a discount code?',
  'coupon.askCode': 'Send your discount code here:',
  'coupon.offer': '🎟 A discount code is ready for this service:',
  'coupon.offerHint':
    'Tap a code. Discount and amount due are shown separately. You can also continue without a code.',
  'coupon.offerLine':
    '• <code>{code}</code>{desc}\n  Discount: <b>{discount}</b>\n  Amount due: <b>{final}</b>',
  'coupon.applied':
    '✅ Code <code>{code}</code> applied.\nAmount: <b>{amount}</b>\nDiscount: <b>{discount}</b>\nPayable: <b>{final}</b>',
  'coupon.invalid': '❌ Invalid code.\n{reason}\nTry again or continue without a code.',
  'test.pickPlan': '🧪 Test plans — pick one:',
  'test.none': 'No test plans available.',
  'test.waitDelivering':
    '⏳ Please wait a moment — your test service is being sent…',
  'renew.pickService': '🔄 Pick a service to renew:',
  'renew.none': 'No active services to renew.',
  'renew.pickPlan': 'Pick renew plan (same category):',
  'renew.pickCategory':
    'This service has no category yet.\nPick the original purchase category so renew plans stay in that category:',
  'renew.noCategoryPlans': 'No renew plans in this category.',
  'renew.paymentMethod': 'Payment method:',
  'renew.sendReceipt':
    '💳 <b>Payment details</b>\n{paymentInfo}\n\n📎 After paying, send the renewal receipt (photo or text).',
  'renew.paidWallet': '✅ Renewed with wallet\nOrder <code>{code}</code>',
  'renew.starsInvoice':
    '⭐ Telegram Stars invoice sent for renewal.\nOrder <code>{code}</code>',
  'renew.walletPayInvoice':
    '👛 Wallet Pay renewal created.\nTracking code: <code>{code}</code>\nTap 👛 Wallet Pay to pay inside Telegram Wallet.',
  'claim.askLink':
    '➕ <b>Register purchased service</b>\n\nSend your subscription link.\nBoth panel links (<code>/s/…</code>) and native 3x-ui / Sanaei links (<code>/sub/…</code>) are accepted.',
  'claim.invalidLink': 'Invalid link. Send the full subscription URL.',
  'claim.pickCategory':
    'Which category was this service from?\n(Future renewals will only show plans from that category.)',
  'claim.noCategories': 'No active categories in this store.',
  'claim.ok':
    '✅ Service <b>{name}</b> was added to your account.\n\n🔗 Your system subscription link:\n<code>{link}</code>',
  'services.title': '📦 <b>My services</b>\nTap a service for details and subscription link:',
  'services.none': 'No services on your account.',
  'services.detail': '📦 <b>{name}</b>\nStatus: <b>{status}</b>\n\n{details}',
  'services.category': '📂 Category: {category}',
  'services.hidden': '✅ Service hidden from your list.',
  'services.expiry': '⏱ Expiry: {expiry}',
  'services.traffic': '📊 Traffic: {used} / {total}',
  'services.subLink':
    '🔗 <b>Subscription link</b> (tap to copy):\n<code>{url}</code>',
  'services.unlimited': 'Unlimited',
  'services.noExpiry': 'No time limit',
  'services.status.active': 'Active',
  'services.status.expired': 'Expired',
  'services.status.disabled': 'Disabled',
  'common.paying': 'Paying…',
  'common.sendReceipt': 'Send receipt',
  'common.sessionExpired': 'Session expired. Start again from menu.',
  'common.error': 'Error',
  'common.receiptNeeded': 'Send a receipt photo or text.',
  'test.created': '🧪 Test account created\nService: {service}\nName: {name}\nUser: {user}',
  'gate.channelRequired':
    '🔒 You must join our channel before using this bot.\n1️⃣ Tap "View channel" and join\n2️⃣ Come back and tap "✅ I joined" to activate the bot',
  'gate.joinChannel': '📢 View channel',
  'gate.iJoined': '✅ I joined',
  'gate.stillNotMember': "You haven't joined the channel yet. Please join first and tap I joined again.",
  'gate.customerBlocked':
    '🚫 Your access to this store has been blocked.\nContact support if you believe this is a mistake.',
  'digital.ready': '🎁 Your code is ready',
  'digital.code': 'Your code:\n<code>{code}</code>',
  'digital.product': '📦 {name}',
  'digital.preconfirm.manual':
    '⏳ Delivery is handled by an operator after payment is confirmed.',
  'digital.preconfirm.automatic':
    '⚡️ After the order is confirmed, it will be sent automatically.',
  'digital.preconfirm.hybridAuto':
    '⚡️ After the order is confirmed, it will be sent automatically.',
  'digital.preconfirm.hybridManual':
    '⏳ Operator delivery — the code will be sent after payment is confirmed.',
  'digital.preconfirm.operator':
    '⏳ Operator delivery — the code or link will be sent after the order is confirmed.',
  'digital.catalog.auto': 'Auto send',
  'digital.catalog.operator': 'Operator delivery',
  'digital.outOfStock': 'Out of stock',
  'digital.pending':
    '⏳ Your digital order is registered.\nWe will send the code here once it is ready.',
  'digital.orders.waiting': 'Order registered. We will notify you when it is ready.',
  'digital.orders.pendingStatus': 'Pending',
  'digital.orders.deliveredStatus': 'Delivered',
  'digital.orders.showCode': '🔐 Show code',
  'btn.digitalServices': '🎁 Digital services',
  'payg.disabled': '⛔ Pay-as-you-go is not available right now.',
  'payg.home': '⚡ <b>Pay as you go</b>\nChoose an option:',
  'payg.pickCategory': '⚡ Pick a category:',
  'payg.noCategories': 'No active PAYG categories yet.',
  'payg.pickPlan': '📋 Pick a plan:',
  'payg.pickDevices': '👥 Choose device / user count:',
  'payg.devicesLine': 'Devices: <b>{n}</b>',
  'payg.confirm':
    '⚡ <b>Confirm PAYG activation</b>\n\n📦 Plan: <b>{plan}</b>\n📐 Mode: <b>{mode}</b>\n👥 Users: <b>{deviceLabel}</b> ({devices})\n💰 Rate: <b>{unitPrice}</b> / {unit}\n\n💳 Balance: <b>{balance}</b>\n🔒 Minimum: <b>{minBalance}</b>',
  'payg.confirmHint':
    'The panel service is unlimited; our system meters usage from your wallet and suspends only when balance runs out.',
  'payg.btn.confirm': '✅ Confirm & activate',
  'payg.mode.volume': 'Volume (per GB)',
  'payg.mode.time': 'Time / unlimited (hourly)',
  'payg.noPlans': 'No active plans in this category.',
  'services.hub': '📦 <b>My services</b>\nWhich section do you want?',
  'services.hub.vpn': '🌐 Internet services',
  'services.hub.payg': '⚡ Pay as you go',
  'services.hub.digital': '🎁 Digital goods',
  'digital.orders.title': '🎁 <b>Your digital purchases</b>',
  'digital.orders.none': 'You have no digital purchases yet.',
  'digital.orders.detail':
    '🎁 <b>{product}</b>\n📶 Status: <b>{status}</b>\n🆔 Tracking: <code>{tracking}</code>\n📅 Date: {date}\n💰 Amount: <b>{amount}</b>',
  'payg.activated':
    '✅ PAYG service activated.\n\n📦 Plan: <b>{plan}</b>\n📶 Status: <b>{status}</b>\n🆔 Subscription: <code>{id}</code>',
  'payg.activateFailed': '⛔ Activation failed:\n{error}',
  'payg.needTopup':
    '⚠️ Wallet balance is too low to activate.\n\nBalance: <b>{balance}</b>\nMinimum required: <b>{minBalance}</b>\nSuggested top-up: <b>{shortfall}</b>\n\nTop up your wallet first.',
  'payg.chargeReminder':
    '⚠️ <b>Important:</b> Keep your wallet charged — PAYG suspends when the balance runs out.',
  'payg.mine': '📦 <b>Your PAYG services</b>',
  'payg.none': 'You have no PAYG subscriptions yet.',
  'payg.usage':
    '📊 <b>Daily usage</b>\n📦 Plan: <b>{plan}</b>\n📶 Status: <b>{status}</b>\n\n{summary}',
  'payg.noUsage': 'No usage recorded yet.',
  'payg.btn.categories': '📂 Categories',
  'payg.btn.mine': '📦 My services',
  'payg.btn.usage': '📊 Usage',
  'payg.unit.hour': 'h',
  'payg.unit.gb': 'GB',
  'payg.unit.day': 'd',
  'payg.btn.pause': '⏸ Pause service',
  'payg.btn.resume': '▶️ Resume service',
  'payg.paused': '⏸ Service paused. Time billing stops until you resume.',
  'payg.resumed': '▶️ Service resumed.',
  'payg.pauseHint':
    'You can pause a time-based service so your wallet is not charged while offline.',
  'payg.activationFee': 'Creation fee: <b>{amount}</b> ({qty} {unit})',
  'payg.maxSubsReached':
    '⛔ You reached the PAYG service limit ({max}). Close one first to free a slot.',
};

/** Localized PAYG billing unit suffix for bot buttons (e.g. /ساعت vs /h). */
export function paygBotUnitSuffix(
  locale: string | null | undefined,
  mode: 'VOLUME' | 'TIME' | string,
): string {
  const m = String(mode || '').toUpperCase();
  if (m === 'VOLUME') return botT(locale, 'payg.unit.gb');
  return botT(locale, 'payg.unit.hour');
}

const CATALOGS: Record<BotLocale, Record<BotMessageKey, string>> = {
  fa: FA,
  en: EN,
};

export function normalizeBotLocale(raw?: string | null): BotLocale {
  const v = String(raw || 'fa').trim().toLowerCase();
  return v === 'en' ? 'en' : 'fa';
}

export function botT(
  locale: string | null | undefined,
  key: BotMessageKey,
  vars?: Record<string, string | number | null | undefined>,
): string {
  const loc = normalizeBotLocale(locale);
  let text = CATALOGS[loc][key] || CATALOGS.en[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v ?? ''));
    }
  }
  return text;
}

export function isTomanBotCurrency(currency?: string | null): boolean {
  const c = String(currency || '').toUpperCase();
  return c === 'TOMAN' || c === 'IRR' || c === 'IRT' || c === 'TMN';
}

export function normalizeWalletCurrency(currency?: string | null): 'TOMAN' | 'USD' {
  return isTomanBotCurrency(currency) ? 'TOMAN' : 'USD';
}

export function currencyLabel(locale: string | null | undefined, currency?: string | null): string {
  if (isTomanBotCurrency(currency)) {
    return botT(locale, 'wallet.currency.toman');
  }
  return botT(locale, 'wallet.currency.usd');
}

/** e.g. "200,000 تومان" */
export function formatBotMoney(
  locale: string | null | undefined,
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  const n = Number(amount) || 0;
  const formatted = n.toLocaleString('en-US', {
    maximumFractionDigits: isTomanBotCurrency(currency) ? 0 : 2,
  });
  return `${formatted} ${currencyLabel(locale, currency)}`;
}

/** Footer after a digital order is registered (Telegram + Mini App). */
export function digitalOrderSubmittedExtra(
  locale: string | null | undefined,
  hint?: 'auto' | 'operator' | null,
  orderMessage?: string | null,
): string {
  if (hint !== 'auto' && hint !== 'operator') return '';
  const loc = normalizeBotLocale(locale);
  const lines = [
    botT(
      loc,
      hint === 'auto' ? 'digital.preconfirm.automatic' : 'digital.preconfirm.operator',
    ),
  ];
  if (hint === 'operator') {
    lines.push(botT(loc, 'digital.pending'));
  }
  const extra = String(orderMessage || '').trim();
  if (extra) lines.push(extra);
  return `\n\n${lines.join('\n')}`;
}

export function parseBotAmount(text: string): number {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  let s = String(text || '');
  s = s.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
  s = s.replace(/[,\s_٫،]/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
