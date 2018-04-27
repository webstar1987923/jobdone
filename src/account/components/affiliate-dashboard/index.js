import Vue from 'vue';
import moment from 'moment';
import vSelect from 'vue-select';
import AnimatedInteger from '../../../shared/components/animated-integer'
import AffiliateDashboardChart from './affiliate-dashboard-chart'

import './styles.scss';


export default Vue.component('AffiliateDashboard', {
    template: `
        <div class="AffiliateDashboard__wrapper">
            <div class="AffiliateDashboard__header">
                <div class="AffiliateDashboard__title">
                    Quick Stats: {{ period.label }}
                </div>
        
                <v-select
                    class="AffiliateDashboard__period-select singleselect"
                    v-model="period"
                    :options="possiblePeriods"
                    :on-change="changePeriod">
                </v-select>
            </div>
            <div class="AffiliateDashboard__indicators">
                <div class="AffiliateDashboard__indicator" 
                    v-for="indicator in indicators">
                    <div class="AffiliateDashboard__indicator-label">{{ indicator.label }}</div>
                    <div class="AffiliateDashboard__indicator-value">
                        <animated-integer v-bind:value="indicator.value"></animated-integer>
                    </div>
                    <div class="AffiliateDashboard__indicator-description AffiliateDashboard__indicator-description--primary">{{ indicator.primaryDescription }}</div>
                    <div class="AffiliateDashboard__indicator-description AffiliateDashboard__indicator-description--secondary">{{ indicator.secondaryDescription }}</div>
                </div>
            </div>
            <div class="AffiliateDashboard__chart">
                <affiliate-dashboard-chart v-if="chart.loaded" :height="270" :data="chart.data" :labels="chart.labels"></affiliate-dashboard-chart>
            </div>
        </div>
    `,

    components: {
        vSelect,
        AnimatedInteger,
        AffiliateDashboardChart
    },
    data() {
        return {
            possiblePeriods: [

                {
                    label: 'Last 7 Days',
                    value: {
                        from: moment().subtract(7, 'days'),
                        to: moment().format()
                    }
                },
                {
                    label: 'Last 30 Days',
                    value: {
                        from: moment().subtract(30, 'days'),
                        to: moment().format()
                    }
                }
            ],
            period: null,
            indicators: [
                {
                    label: 'impressions',
                    value: 0,
                    primaryDescription: 'No Data',
                    secondaryDescription: 'No Data'
                },
                {
                    label: 'registration',
                    value: 0,
                    primaryDescription: 'No Data',
                    secondaryDescription: 'No Data'
                },
                {
                    label: 'commissions',
                    value: 0,
                    primaryDescription: 'No Data',
                    secondaryDescription: 'No Data'
                },
                {
                    label: 'payout',
                    value: 0,
                    primaryDescription: 'No Data',
                    secondaryDescription: 'No Data'
                },
                {
                    label: 'payout(2017 YTD)',
                    value: 0,
                    primaryDescription: 'No Data',
                    secondaryDescription: 'No Data'
                },
                {
                    label: 'total withdraw',
                    value: 0,
                    primaryDescription: 'No Data',
                    secondaryDescription: 'No Data'
                }
            ],
            chart: {
                data: [],
                labels: [],
                loaded: false
            }
        }
    },
    methods: {
        changePeriod(v) {
            this.period = v;
            this.getIndicators();
            this.buildChart();
        },
        getIndicators() {
            // api call to get indicators should be here
            setTimeout(() => {
                this.indicators.forEach(v => {
                    v.value = 0;
                });
            }, 1000);
        },
        buildChart() {
            this.chart.loaded = false;
            this.chart.data = [];
            this.chart.labels = [];
            const periods = moment(this.period.value.to)
              .diff(
                moment(this.period.value.from),
                'days'
              ) + 1;
            const randomData = [[],[],[]];
            for (let i = 0; i < periods; i ++) {
               this.chart.labels.push(
                 moment(this.period.value.to).subtract(i, 'days').format('Do')
               );
                randomData[0].push(0);
                randomData[1].push(0);
                randomData[2].push(0);
            }

            //for each chart line
            this.chart.data.push({
                label: 'Impressions',
                data: randomData[0],
                color: '#cccccc'
            });
            this.chart.data.push({
                label: 'Commisions',
                data: randomData[1],
                color: '#0071BC'
            });
            this.chart.data.push({
                label: 'Registrations',
                data: randomData[2],
                color: '#8CC63F'
            });
            setTimeout(() => {
                this.chart.loaded = true;
            });

        }
    },
    beforeMount() {
        this.period = this.possiblePeriods[0];
        this.getIndicators();
        this.buildChart();
    }
});