'use strict'

const listPayments = (data) => {
  return new Promise(resolve => {
    let result = []
    result = data.application.hidden_data.payment_options.map(async method => {
      let item = {}
      if (!(item.discount = listSchema.item.discount(method, data))) {
        delete item.discount
      }
      if (!(item.icon = listSchema.item.icon(method))) {
        delete item.icon
      }
      if (!(item.installment_options = listSchema.item.installment_options(method, data))) {
        delete item.installment_options
      }
      if (!(item.intermediator = listSchema.item.intermediator(method))) {
        delete item.intermediator
      }
      if (method.type === 'credit_card') {
        if (!(item.js_client = await listSchema.item.js_client())) {
          delete item.js_client
        }
      }
      if (!(item.label = listSchema.item.label(method))) {
        delete item.label
      }
      if (!(item.payment_method = listSchema.item.payment_method(method))) {
        delete item.payment_method
      }
      if (!(item.payment_url = listSchema.item.payment_url(method))) {
        delete item.payment_url
      }
      if (!(item.type = listSchema.item.type(method))) {
        delete item.type
      }
      return item
    })
    Promise.all(result).then((gateways) => {
      let options = listPaymentsOptions(data)
      let promise = {
        payment_gateways: gateways,
        discount_options: options.discount_options,
        interest_free_installments: options.interest_free_installments
      }
      resolve(promise)
    })
  })
}

const requestOrder = (payload) => {
  return {
    ownId: payload.params.order_number,
    amount: {
      currency: payload.params.currency_id,
      subtotals: {
        shipping: Math.round(payload.params.amount.freight * 100)
      }
    },
    items: orderItems(payload.params.items),
    customer: {
      // id: payload.params.intermediator_buyer_id,
      ownId: payload.params.buyer.customer_id,
      fullname: payload.params.buyer.fullname,
      email: payload.params.buyer.email,
      birthDate: birthDateConvert(payload.params.buyer.birth_date),
      taxDocument: {
        type: payload.params.buyer.registry_type === 'p' ? 'CPF' : 'CNPJ',
        number: payload.params.buyer.doc_number
      },
      phone: {
        countryCode: payload.params.buyer.phone.country_code || '55',
        areaCode: payload.params.buyer.phone.number.substr(0, 2),
        number: payload.params.buyer.phone.number
      },
      shippingAddress: {
        city: payload.params.to.city,
        // complement: payload.params.to.complement,
        district: payload.params.to.borough,
        street: payload.params.to.street,
        streetNumber: payload.params.to.number,
        zipCode: payload.params.to.zip,
        state: (typeof payload.params.to !== 'undefined') && (typeof payload.params.to.province_code !== 'undefined') ? payload.params.to.province_code : payload.params.to.province,
        country: payload.params.to.country_code || 'BRA'
      }
    }
  }
}

let paymentResponse = (payment) => {
  switch (payment.fundingInstrument.method) {
    case 'BOLETO': return methodSchemas.boleto(payment)
    case 'CREDIT_CARD': return methodSchemas.card(payment)
    case 'ONLINE_BANK_DEBIT': return methodSchemas.debit(payment)
    default: break
  }
}

let listSchema = {
  item: {
    discount: (payment, data) => {
      if (payment.discount) {
        let discount = data.application.hidden_data.payment_options.filter(el => {
          if (!el.discount) {
            return false
          }
          return true
        }).reduce(service => {
          if (payment.type === service.type) {
            return {
              type: service.discount.type,
              value: service.discount.value
            }
          }
        })
        return discount
      }
      return false
    },
    icon: (payment) => {
      if (payment.icon) {
        return payment.icon
      }
      return false
    },
    installment_options: (payment, data) => {
      if (payment.installments) {
        let parcelasSemJuros
        let parcelasComJuros
        let valorJuros
        payment.installments.map(installment => {
          if (installment.tax === true) {
            parcelasComJuros = installment.number
            valorJuros = installment.tax_value
          } else {
            parcelasSemJuros = installment.number
          }
        })

        let items = []
        for (let i = 1; i <= parcelasSemJuros; i++) {
          if (i > 1) {
            let item = {
              number: i,
              tax: false,
              value: Math.round((data.params.amount.total / i))
            }
            items.push(item)
          }
        }
        for (let j = parcelasSemJuros + 1; j <= parcelasComJuros; j++) {
          let finalValue = data.params.amount.total / j
          let item = {
            number: j,
            tax: true,
            value: Math.round((finalValue * valorJuros) + finalValue)
          }
          items.push(item)
        }
        return items
      }
      return false
    },
    intermediator: (payment) => {
      if (payment.intermediator) {
        return {
          code: payment.intermediator.code,
          link: payment.intermediator.link,
          name: payment.intermediator.name
        }
      }
    },
    js_client: async () => {
      let pubk = `-----BEGIN PUBLIC KEY-----
      MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhhcuwAG4WYmhNVe+y5eO
      qrOn3+fbfnDQkuVMHXC8iiA4svXMtMldYrwxZIAIuy52Y99teOSEDc0h47RkqzJM
      WYRKjNMyR4lbyAHpkAHnWp/Jg4IIp412BB1W1qAJWen+MaIUrrOZa5ldI1qWBJ9f
      oSfWauRODTAvwSJ/VEKBhszSJU5u482lRxgSY1t5SgDHPlNMGC7mI9AXec8OcYYr
      93QSXnOg5SecUWMKpwfLR+exw8mVFBY90TNuyzQ5WsNwJ1kKiHdca2N7OgJ+lxt7
      L3UBrIRezmdtAjEMcuCVnqpCcVU9VDBoWWv0oPTB6MGtAEAYn891DGhAtyEYq74D
      owIDAQAB
      -----END PUBLIC KEY-----`
      return new Promise(resolve => {
        let onloadFunction = 'window.wirecardHash=function(n){return MoipSdkJs.MoipCreditCard.setPubKey(' + JSON.stringify(pubk) + ').setCreditCard({number:n.number,cvc:n.cvc,expirationMonth:n.month,expirationYear:n.year}).hash()},window.wirecardBrand=function(n){return MoipValidator.cardType(n.number)};'
        let schema = {
          cc_brand: {
            function: 'wirecardBrand',
            is_promise: false
          },
          cc_hash: {
            function: 'wirecardHash',
            is_promise: true
          },
          fallback_script_uri: 'https://wirecard.ecomplus.biz/assets/moip-sdk-js.js',
          onload_expression: onloadFunction,
          script_uri: 'https://cdn.jsdelivr.net/gh/wirecardBrasil/moip-sdk-js/dist/moip-sdk-js.js'
        }
        return resolve(schema)
      })
    },
    label: (payment) => {
      if (payment.name) {
        return payment.name
      }
      return false
    },
    payment_method: (payment) => {
      if (payment.type) {
        return {
          code: payment.type,
          name: payment.name
        }
      }
    },
    payment_url: (payment) => {
      if (payment.url) {
        return payment.url
      }
      return false
    },
    type: (payment) => {
      return payment.payment_type || 'payment'
    }
  }
}

let listPaymentsOptions = (params) => {
  let freeInstallments
  params.application.hidden_data.payment_options.forEach(data => {
    if (typeof data.installments !== 'undefined') {
      data.installments.filter(option => {
        if (option.tax === false) {
          freeInstallments = option.number
        }
      })
    }
  })
  //
  let boleto = params.application.hidden_data.payment_options.find(hidden => hidden.type === 'banking_billet')
  //
  return {
    discount_options: {
      label: boleto.name,
      type: boleto.discount.type,
      value: boleto.discount.value
    },
    interest_free_installments: freeInstallments
  }
}

let orderItems = (items) => {
  let products = []
  products = items.map(item => {
    return {
      product: item.name,
      quantity: item.quantity,
      price: Math.round(item.price * 100) // wirecard só aceita inteiro
    }
  })
  return products
}

let birthDateConvert = (birthdate) => {
  return birthdate.year + '-' + birthdate.month + '-' + birthdate.day
}

let methodSchemas = {
  boleto: (payment) => {
    return {
      redirect_to_payment: false,
      transaction: {
        amount: payment.amount.total / 100,
        banking_billet: {
          code: payment.fundingInstrument.boleto.lineCode,
          link: payment._links.payBoleto.printHref,
          text_lines: [
            payment.fundingInstrument.boleto.instructionLines.first || '',
            payment.fundingInstrument.boleto.instructionLines.second || '',
            payment.fundingInstrument.boleto.instructionLines.third || ''
          ],
          valid_thru: new Date(payment.fundingInstrument.boleto.expirationDate).toISOString()
        },
        creditor_fees: {
          installment: payment.installmentCount,
          intermediation: payment.fees[0].amount
        },
        currency_id: payment.amount.currency,
        installments: {
          number: payment.installmentCount
        },
        intermediator: {
          payment_method: {
            code: 'banking_billet',
            name: 'Boleto'
          },
          transaction_id: payment.id,
          transaction_code: payment.id,
          transaction_reference: payment._links.order.title
        },
        payment_link: payment._links.self.href,
        status: {
          current: paymentStatus(payment.status)
        }
      }
    }
  },
  card: (payment) => {
    return {
      redirect_to_payment: false,
      transaction: {
        amount: payment.amount.total / 100,
        credit_card: {
          avs_result_code: null,
          company: payment.fundingInstrument.creditCard.brand,
          cvv_result_code: null,
          holder_name: payment.fundingInstrument.creditCard.holder.fullname,
          last_digits: payment.fundingInstrument.creditCard.last4,
          token: payment.fundingInstrument.creditCard.id
        },
        creditor_fees: {
          installment: payment.installmentCount,
          intermediation: payment.fees.amount
        },
        currency_id: payment.amount.currency,
        installments: {
          number: payment.installmentCount,
          tax: (payment.amount.fees > 0),
          total: payment.amount.total / 100,
          value: payment.amount.gross / 100
        },
        intermediator: {
          payment_method: {
            code: 'credit_card',
            name: 'Cartão de Crédito'
          },
          transaction_id: payment.id,
          transaction_code: payment.id,
          transaction_reference: payment._links.order.title
        },
        payment_link: payment._links.self.href,
        status: {
          current: paymentStatus(payment.status)
        }
      }
    }
  },
  debit: (payment) => {
    return {
      redirect_to_payment: false,
      transaction: {
        amount: payment.amount.total,
        payment_link: payment._links.payOnlineBankDebitItau.redirectHref
      }
    }
  }
}

let paymentStatus = (status) => {
  switch (status) {
    case 'WAITING': return 'pending'
    case 'IN_ANALYSIS': return 'under_analysis'
    case 'PRE_AUTHORIZED': return 'under_analysis'
    case 'AUTHORIZED': return 'authorized'
    case 'CANCELLED': return 'voided'
    case 'REFUNDED': return 'refunded'
    case 'REVERSED': return 'refunded'
    case 'SETTLED': return 'paid'
    default: return 'unknown'
  }
}

module.exports = {
  listPayments,
  requestOrder,
  paymentResponse
}